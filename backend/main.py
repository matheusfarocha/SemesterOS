import logging
from pathlib import PurePosixPath
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from snowflake.connector.errors import Error as SnowflakeError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from . import workspace
from .gemini import GeminiError, extract_pdf
from .snowflake_db import ConfigurationError, cursor, describe_error, stage_pdf
from .syllabus import Confirm, MAX_PDF_BYTES

app = FastAPI(title="SemesterOS API")
log = logging.getLogger(__name__)
MAX_REQUEST_BYTES = MAX_PDF_BYTES + 64 * 1024


@app.exception_handler(ConfigurationError)
async def missing_settings(request, error):
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(SnowflakeError)
async def snowflake_error(request, error):
    log.error("Snowflake session failed. %s", describe_error(error))
    return JSONResponse(status_code=503, content={"detail": "Snowflake is unavailable. Check the server configuration and try again."})


class UploadTooLarge(MultiPartException):
    pass


async def limited_upload(request):
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_REQUEST_BYTES:
            raise UploadTooLarge("PDFs must be 10 MB or smaller.")
        yield chunk


@app.post("/api/syllabus/upload", status_code=201, openapi_extra={"requestBody": {
    "required": True, "content": {"multipart/form-data": {"schema": {
        "type": "object", "required": ["file"], "properties": {"file": {"type": "string", "format": "binary"}},
    }}},
}})
async def upload(request: Request):
    content_type = request.headers.get("content-type", "")
    if content_type.split(";", 1)[0].strip().lower() != "multipart/form-data":
        raise HTTPException(415, "Send the PDF as a multipart file upload.")
    try:
        form = await MultiPartParser(request.headers, limited_upload(request), max_files=1, max_fields=0).parse()
    except UploadTooLarge as error:
        raise HTTPException(413, error.message) from error
    except MultiPartException as error:
        raise HTTPException(400, "Send exactly one PDF in the file field.") from error

    try:
        file = form.get("file")
        if not isinstance(file, UploadFile) or not file.filename or not file.size:
            raise HTTPException(400, "Choose a PDF to upload.")
        filename = PurePosixPath(file.filename.replace("\\", "/")).name
        if not filename.lower().endswith(".pdf") or file.content_type not in {
            None, "application/pdf", "application/octet-stream",
        }:
            raise HTTPException(415, "Choose a PDF file.")
        if file.size > MAX_PDF_BYTES:
            raise HTTPException(413, "PDFs must be 10 MB or smaller.")
        if not (await file.read(8)).startswith(b"%PDF-"):
            raise HTTPException(415, "The uploaded file has no PDF header.")
        await file.seek(0)
        return await run_in_threadpool(extract_upload, file.file, filename[:255], file.size)
    finally:
        await form.close()


def extract_upload(stream, original_filename, size):
    file_id = uuid4()
    upload_id = file_id.hex
    try:
        syllabus = extract_pdf(stream.read(), upload_id)
    except GeminiError as error:
        log.warning("Gemini extraction failed for syllabus %s. %s", upload_id, error)
        raise HTTPException(502, str(error)) from error
    except ValueError as error:
        log.warning("Invalid Gemini response for syllabus %s (%s).", upload_id, type(error).__name__)
        raise HTTPException(422, "Gemini could not extract valid syllabus information from this PDF.") from error

    stream.seek(0)
    with cursor() as db:
        try:
            filename = stage_pdf(db, stream, file_id)
        except (SnowflakeError, ValueError) as error:
            log_snowflake_step("PDF staging", upload_id, error)
            raise HTTPException(502, "Snowflake could not stage the PDF.") from error

        workspace.register_upload(db, upload_id, original_filename, filename, size)
    return {"upload_id": upload_id, "status": "extracted", "syllabus": syllabus}


def log_snowflake_step(step, upload_id, error):
    detail = describe_error(error) if isinstance(error, SnowflakeError) else str(error)
    log.warning("%s failed for syllabus %s. %s", step, upload_id, detail)


@app.post("/api/syllabus/confirm")
def confirm(payload: Confirm):
    syllabus = payload.syllabus
    if not (syllabus.course.name or syllabus.course.code):
        raise HTTPException(422, "Enter a course name or code before confirming.")
    if any(event.course_id not in (None, payload.upload_id) for event in syllabus.events):
        raise HTTPException(422, "A calendar event belongs to a different course.")

    with cursor() as db:
        confirmed = workspace.confirm_draft(db, payload.upload_id, syllabus)
    if confirmed is None:
        raise HTTPException(404, "Syllabus upload was not found.")
    return confirmed


@app.get("/api/courses")
def courses():
    with cursor() as db:
        return [entry["course"] for entry in workspace.list_confirmed(db)]


@app.get("/api/events")
def events():
    with cursor() as db:
        records = [event for entry in workspace.list_confirmed(db) for event in entry["events"]]
    return sorted(records, key=workspace.event_order)


@app.get("/api/courses/{course_id}/grading")
def grading(course_id: UUID):
    with cursor() as db:
        confirmed = workspace.get_confirmed(db, course_id.hex)
    if confirmed is None:
        raise HTTPException(404, "Course was not found.")
    return confirmed["grading"]
