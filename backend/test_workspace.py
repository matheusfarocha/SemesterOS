import asyncio
import base64
import json
import os
import sqlite3
import unittest
from contextlib import closing, contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from . import main, workspace

PDF = b"%PDF-1.4\n"
GEMINI_BODY = {
    "course": {"code": "MATH 2410", "semester": "Fall 2026"},
    "events": [
        {"title": "Final exam", "date_text": "December 9, 2026", "time_text": "10:00 AM", "grading_category": "Final Exam"},
        {"title": "Project", "date_text": "Week 10"},
    ],
    "grading": [{"category": "Final Exam", "weight": 45}, {"category": "Project", "weight": None}],
    "policies": {"late_work": "Late work loses 10 points per day"},
}


class SnowflakeTestCursor:
    """Exercise the app's SQL state transitions against an isolated local database."""

    def __init__(self, db, uploads):
        self.db = db
        self.uploads = uploads

    def execute(self, sql, parameters=(), **options):
        if sql.startswith("PUT "):
            self.uploads.append(options["file_stream"].read())
            self.result = iter([{"status": "UPLOADED"}])
        else:
            sql = (sql.replace(workspace.UPLOADS, "syllabus_uploads").replace("%s", "?")
                   .replace("PARSE_JSON(?)", "?").replace("TO_JSON(CONFIRMED)", "CONFIRMED")
                   .replace("CURRENT_TIMESTAMP()", "CURRENT_TIMESTAMP"))
            self.result = self.db.execute(sql, parameters)
        return self

    def fetchone(self):
        return next(iter(self.result), None)

    def __iter__(self):
        return iter(self.result)


class WorkspaceTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        scratch = self.enterContext(TemporaryDirectory())
        self.path = Path(scratch) / "database.sqlite3"
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("""
                CREATE TABLE syllabus_uploads (
                    ID TEXT PRIMARY KEY, ORIGINAL_FILENAME TEXT, STAGED_FILENAME TEXT,
                    SIZE_BYTES INTEGER, STATUS TEXT, CONFIRMED_AT TEXT, CONFIRMED TEXT
                )
            """)
        self.uploads = []
        self.enterContext(patch.object(main, "cursor", self.snowflake_cursor))
        self.enterContext(patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"}))
        self.gemini = self.enterContext(patch("backend.gemini.requests.post", side_effect=self.gemini_response))

    @contextmanager
    def snowflake_cursor(self):
        with closing(sqlite3.connect(self.path, isolation_level=None)) as db:
            db.row_factory = sqlite3.Row
            yield SnowflakeTestCursor(db, self.uploads)

    def gemini_response(self, url, *, headers, json, timeout, allow_redirects):
        self.assertTrue(url.endswith("/gemini-test:generateContent"))
        self.assertEqual(headers, {"x-goog-api-key": "test-key"})
        self.assertNotIn("test-key", url)
        self.assertFalse(allow_redirects)
        inline = json["contents"][0]["parts"][0]["inlineData"]
        self.assertEqual(inline["mimeType"], "application/pdf")
        self.assertEqual(base64.b64decode(inline["data"]), PDF)
        config = json["generationConfig"]
        self.assertEqual(config["responseMimeType"], "application/json")
        schema = config["responseJsonSchema"]
        self.assertIn("events", schema["properties"])
        self.assertNotIn("maxItems", schema["properties"]["events"])
        self.assertNotIn("course_id", schema["$defs"]["Event"]["properties"])
        self.assertNotIn("maximum", schema["$defs"]["Grading"]["properties"]["weight"]["anyOf"][0])
        return Mock(status_code=200, json=lambda: result_for(GEMINI_BODY))

    async def request(self, method, path, body=b"", content_type=None):
        messages = []

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message):
            messages.append(message)

        await main.app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http",
            "path": path, "root_path": "", "query_string": b"",
            "headers": [(b"content-type", content_type.encode())] if content_type else [],
            "server": ("test", 80), "client": ("test", 80),
        }, receive, send)
        return messages[0]["status"], json.loads(b"".join(message["body"] for message in messages[1:]))

    async def upload(self):
        return await self.request(
            "POST", "/api/syllabus/upload",
            b'--boundary\r\nContent-Disposition: form-data; name="file"; filename="fixture.pdf"\r\n'
            b"Content-Type: application/pdf\r\n\r\n" + PDF + b"\r\n--boundary--\r\n",
            "multipart/form-data; boundary=boundary",
        )

    async def test_upload_review_confirm_and_retrieve(self):
        status, draft = await self.upload()
        self.assertEqual(status, 201, draft)
        self.assertEqual(draft["status"], "extracted")
        self.assertEqual(self.uploads, [PDF])
        course_id = draft["upload_id"]
        with closing(sqlite3.connect(self.path)) as db:
            receipt = db.execute("SELECT ORIGINAL_FILENAME, STAGED_FILENAME, CONFIRMED FROM syllabus_uploads").fetchone()
            self.assertEqual(receipt, ("fixture.pdf", f"{course_id}.pdf", None))
        self.assertEqual(await self.request("GET", "/api/courses"), (200, []))
        self.assertEqual(await self.request("GET", "/api/events"), (200, []))
        self.assertEqual((await self.request("GET", f"/api/courses/{course_id}/grading"))[0], 404)

        draft["syllabus"]["course"]["name"] = "Reviewed Calculus"
        payload = json.dumps({"upload_id": course_id, "syllabus": draft["syllabus"]}).encode()
        first, second = await asyncio.gather(*[
            self.request("POST", "/api/syllabus/confirm", payload, "application/json") for _ in range(2)
        ])
        status, saved = first
        self.assertEqual(status, 200)
        self.assertEqual(first, second)
        self.assertEqual(saved["status"], "confirmed")
        self.assertEqual(saved["course"]["course"]["name"], "Reviewed Calculus")
        self.assertEqual(await self.request("GET", "/api/courses"), (200, [saved["course"]]))
        self.assertEqual(await self.request("GET", "/api/events"), (200, saved["events"]))
        self.assertEqual(await self.request("GET", f"/api/courses/{course_id}/grading"), (200, saved["grading"]))
        dated, undated = saved["events"]
        self.assertEqual((dated["course_id"], dated["date"], dated["time"]), (course_id, "2026-12-09", "10:00:00"))
        self.assertEqual(dated["grading_id"], saved["grading"][0]["id"])
        self.assertEqual((undated["date"], undated["date_text"]), (None, "Week 10"))

    async def test_malformed_gemini_output_creates_no_upload(self):
        self.gemini.side_effect = None
        self.gemini.return_value = Mock(status_code=200, json=lambda: result_for({}))
        self.assertEqual((await self.upload())[0], 422)
        self.assertEqual(self.uploads, [])
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM syllabus_uploads").fetchone()[0], 0)

    async def test_missing_gemini_key_is_reported_without_upload(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            self.assertEqual((await self.upload())[0], 503)
        self.gemini.assert_not_called()
        self.assertEqual(self.uploads, [])


def result_for(value):
    return {"candidates": [{"finishReason": "STOP", "content": {"parts": [
        {"thought": True, "text": "Internal analysis"},
        {"text": json.dumps(value)},
    ]}}]}
