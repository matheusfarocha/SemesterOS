"""Snowflake persistence for review receipts and confirmed syllabus records."""

import json
from uuid import uuid4

from .snowflake_db import STAGE
from .syllabus import normalize_date, normalize_full_slash_date

UPLOADS = "SEMESTEROS.APP.SYLLABUS_UPLOADS"
DATE_REVIEW_VERSION = 2


def reset_syllabi(db):
    # Clear the records first. If stage cleanup fails, retrying still removes the files.
    db.execute(f"DELETE FROM {UPLOADS}")
    db.execute(f"REMOVE {STAGE}").fetchall()


def register_upload(db, upload_id, original_filename, staged_filename, size):
    db.execute(
        f"INSERT INTO {UPLOADS} (ID, ORIGINAL_FILENAME, STAGED_FILENAME, SIZE_BYTES, STATUS) "
        "VALUES (%s, %s, %s, %s, 'extracted')",
        (upload_id, original_filename, staged_filename, size),
    )


def confirm_draft(db, upload_id, syllabus):
    confirmed = confirmed_snapshot(upload_id, syllabus)
    # Updating the existing receipt in one statement makes confirmation retry-safe.
    db.execute(
        f"UPDATE {UPLOADS} SET CONFIRMED = PARSE_JSON(%s), STATUS = 'confirmed', "
        "CONFIRMED_AT = CURRENT_TIMESTAMP() WHERE ID = %s AND STATUS = 'extracted' AND CONFIRMED IS NULL",
        (json.dumps(confirmed, allow_nan=False), upload_id),
    )
    return get_confirmed(db, upload_id)


def confirmed_snapshot(course_id, syllabus):
    course = {
        "id": course_id, "upload_id": course_id,
        "course": syllabus.course.model_dump(mode="json"),
        "policies": syllabus.policies.model_dump(mode="json"),
    }
    grading = [
        {"id": uuid4().hex, "course_id": course_id, **grade.model_dump(mode="json")}
        for grade in syllabus.grading
    ]
    categories = {}
    for grade in grading:
        categories.setdefault(grade["category"].casefold(), []).append(grade["id"])

    events = []
    for item in syllabus.events:
        matches = categories.get((item.grading_category or "").casefold(), [])
        events.append({
            **item.model_dump(mode="json"),
            "id": uuid4().hex,
            "course_id": course_id,
            "grading_id": matches[0] if len(matches) == 1 else None,
        })
    events.sort(key=event_order)
    return {
        "status": "confirmed", "course": course, "events": events, "grading": grading,
        "dates_reviewed": DATE_REVIEW_VERSION,
    }


def event_order(event):
    return (
        event["date"] is None, event["date"] or "",
        event["time"] is None, event["time"] or "", event["id"],
    )


def list_confirmed(db):
    return [
        decode_confirmed(row["PAYLOAD"])
        for row in db.execute(
            f"SELECT TO_JSON(CONFIRMED) AS PAYLOAD FROM {UPLOADS} "
            "WHERE STATUS = 'confirmed' AND CONFIRMED IS NOT NULL ORDER BY ID"
        )
    ]


def get_confirmed(db, course_id):
    row = db.execute(
        f"SELECT TO_JSON(CONFIRMED) AS PAYLOAD FROM {UPLOADS} "
        "WHERE ID = %s AND STATUS = 'confirmed' AND CONFIRMED IS NOT NULL",
        (course_id,),
    ).fetchone()
    return decode_confirmed(row["PAYLOAD"]) if row else None


def decode_confirmed(payload):
    confirmed = json.loads(payload)
    date_review = confirmed.pop("dates_reviewed", False)
    if date_review != DATE_REVIEW_VERSION:
        semester = confirmed["course"]["course"].get("semester")
        for event in confirmed["events"]:
            if event["date"] is not None:
                continue
            # The earlier review already supported shorthand dates. Backfill only full slash dates for those uploads.
            raw = event["date_text"]
            date = normalize_full_slash_date(raw) if date_review else normalize_date(raw, semester)
            if date:
                event["date"] = date.isoformat()
        confirmed["events"].sort(key=event_order)
    return confirmed
