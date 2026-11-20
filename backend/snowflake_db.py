import os
import re
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from snowflake.connector import DictCursor, connect
from snowflake.connector.errors import Error as SnowflakeError

ROOT = Path(__file__).resolve().parents[1]
DATABASE = "SEMESTEROS"
SCHEMA = "APP"
STAGE = "@SEMESTEROS.APP.SYLLABI"
load_dotenv(ROOT / ".env")


class ConfigurationError(Exception):
    pass


def login_failure_id(error):
    if error.errno == 390144:
        match = re.search(r"\[([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\]", error.msg or "", re.IGNORECASE)
        if match:
            return match.group(1)
    return None


@contextmanager
def cursor():
    settings = {
        "account": os.getenv("SNOWFLAKE_ACCOUNT"),
        "user": os.getenv("SNOWFLAKE_USER"),
        "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE"),
        "role": os.getenv("SNOWFLAKE_ROLE"),
        "private_key_file": os.getenv("SNOWFLAKE_PRIVATE_KEY_FILE"),
    }
    missing = [f"SNOWFLAKE_{key.upper()}" for key, value in settings.items() if not value]
    if missing:
        raise ConfigurationError("Configure " + ", ".join(missing) + " in the backend .env.")
    key_path = Path(settings["private_key_file"]).expanduser()
    settings["private_key_file"] = str(ROOT / key_path)
    if not Path(settings["private_key_file"]).is_file():
        raise ConfigurationError("SNOWFLAKE_PRIVATE_KEY_FILE must point to a readable key file.")
    if password := os.getenv("SNOWFLAKE_PRIVATE_KEY_PASSWORD"):
        settings["private_key_file_pwd"] = password
    try:
        connection = connect(
            **settings, database=DATABASE, schema=SCHEMA, authenticator="SNOWFLAKE_JWT",
            autocommit=True, login_timeout=15, network_timeout=210,
            session_parameters={"STATEMENT_TIMEOUT_IN_SECONDS": 180},
        )
    except (OSError, ValueError, TypeError) as error:
        if isinstance(error, TypeError) and "private key is not encrypted" in str(error).lower():
            raise ConfigurationError("Remove SNOWFLAKE_PRIVATE_KEY_PASSWORD for an unencrypted private key.") from error
        raise ConfigurationError("Check the Snowflake private key file and passphrase.") from error
    with connection:
        with connection.cursor(DictCursor) as handle:
            handle.execute("USE SECONDARY ROLES NONE")
            handle.execute(f"USE SCHEMA {DATABASE}.{SCHEMA}")
            handle.execute("USE WAREHOUSE IDENTIFIER(%s)", (settings["warehouse"],))
            yield handle


def stage_pdf(db, stream, file_id):
    filename = f"{file_id.hex}.pdf"
    row = db.execute(
        f"PUT file:///tmp/{filename} {STAGE} AUTO_COMPRESS=FALSE OVERWRITE=FALSE",
        file_stream=stream,
    ).fetchone()
    if not row or str(row.get("status", row.get("STATUS"))).upper() != "UPLOADED":
        raise ValueError("Snowflake did not return UPLOADED for the PDF.")
    return filename


def describe_error(error):
    message = f"Snowflake code {error.errno}, SQLSTATE {error.sqlstate}."
    if failure_id := login_failure_id(error):
        return f"{message} Login failure ID: {failure_id}."
    if error.sfqid:
        return f"{message} Query ID: {error.sfqid}."
    return message


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["check"])
    parser.parse_args()
    step = "session setup"
    try:
        with cursor() as handle:
            print("Snowflake key-pair session opened.")
            step = "SQL check"
            result = handle.execute("SELECT 1 + 1 AS RESULT").fetchone()
            if not result or result["RESULT"] != 2:
                parser.exit(1, "Snowflake returned an unexpected SQL check result.\n")
            print("SQL check returned 2.")
            step = "stage LIST"
            handle.execute(f"LIST {STAGE}").fetchone()
            print(f"Stage accessible: {STAGE}")
    except ConfigurationError as error:
        parser.exit(1, f"{error}\n")
    except SnowflakeError as error:
        parser.exit(1, f"{step} failed. {describe_error(error)}\n")
