"""Verify live Gemini PDF extraction and Snowflake staging without saving a course."""

import argparse
import sys
from pathlib import Path
from uuid import uuid4

from snowflake.connector.errors import Error as SnowflakeError

from .gemini import GeminiError, extract_pdf
from .snowflake_db import ConfigurationError, STAGE, cursor, describe_error, stage_pdf
from .syllabus import MAX_PDF_BYTES
from .workspace import UPLOADS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Path to a syllabus PDF with a printed course code")
    parser.add_argument("--expect-code", help="Expected course code for this test PDF")
    args = parser.parse_args()

    step = "PDF validation"
    try:
        with args.pdf.open("rb") as stream:
            pdf = stream.read(MAX_PDF_BYTES + 1)
            if (args.pdf.suffix.lower() != ".pdf" or len(pdf) > MAX_PDF_BYTES
                    or not pdf.startswith(b"%PDF-")):
                raise ValueError("Provide a PDF up to 10 MB.")

            file_id = uuid4()
            step = "Gemini extraction"
            syllabus = extract_pdf(pdf, file_id.hex)
            code = syllabus.course.code
            if args.expect_code and (not code or code.casefold() != args.expect_code.strip().casefold()):
                raise ValueError(f"Gemini returned {code!r}; expected {args.expect_code!r}.")
            print(f"Gemini extracted {code or syllabus.course.name or 'a syllabus'} "
                  f"with {len(syllabus.events)} events and {len(syllabus.grading)} grading categories.", flush=True)

            step = "Snowflake session setup"
            with cursor() as db:
                step = "stage LIST"
                db.execute(f"LIST {STAGE}").fetchone()
                print(f"LIST passed. Query ID: {db.sfqid}", flush=True)

                step = "PDF PUT"
                stream.seek(0)
                filename = stage_pdf(db, stream, file_id)
                print(f"PUT passed. Query ID: {db.sfqid}", flush=True)
                try:
                    step = "persistence table access"
                    db.execute(f"SELECT CONFIRMED FROM {UPLOADS} LIMIT 0")
                    print(f"Persistence table SELECT passed. Query ID: {db.sfqid}", flush=True)
                finally:
                    try:
                        db.execute(f"REMOVE {STAGE}/{filename}").fetchall()
                    except SnowflakeError as error:
                        print(f"Could not remove the test PDF {filename}. {describe_error(error)}", file=sys.stderr)
    except SnowflakeError as error:
        parser.exit(1, f"{step} failed. {describe_error(error)}\n")
    except (ConfigurationError, GeminiError, OSError, ValueError) as error:
        parser.exit(1, f"{step} failed. {error}\n")


if __name__ == "__main__":
    main()
