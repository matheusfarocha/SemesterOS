import datetime as dt
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

MAX_PDF_BYTES = 10 * 1024 * 1024

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Percent = Annotated[float, Field(ge=0, le=100)]
Identifier = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{32}$")]
GradedEventType = Literal["assignment", "quiz", "exam", "project", "presentation"]
EventType = GradedEventType | Literal["important_date"]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Course(Record):
    name: Text | None = None
    code: Text | None = None
    professor: Text | None = None
    email: Text | None = None
    contact: Text | None = None
    semester: Text | None = None
    meetings: Text | None = None
    office_hours: Text | None = None
    description: Text | None = None
    credits: Annotated[float, Field(ge=0, le=100)] | None = None


class LetterGrade(Record):
    letter: Text
    threshold: Text


class Policies(Record):
    attendance: Text | None = None
    late_work: Text | None = None
    absence_limit: Annotated[int, Field(ge=0, le=365)] | None = None
    absence_penalty: Percent | None = None
    extra_credit: Text | None = None
    dropped_assignments: Text | None = None
    other: Text | None = None
    letter_grades: list[LetterGrade] = Field(default_factory=list, max_length=50)


class Event(Record):
    course_id: Identifier | None = None
    title: Text
    type: EventType | None = None
    date: dt.date | None = None
    time: dt.time | None = None
    date_text: Text | None = None
    time_text: Text | None = None
    grading_category: Text | None = None
    points: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None

    @field_validator("time")
    @classmethod
    def local_time(cls, value):
        if value is not None and value.tzinfo is not None:
            raise ValueError("Use a local time and preserve the time zone in time_text.")
        return value


class Grading(Record):
    category: Text
    weight: Percent | None = None


class Syllabus(Record):
    course: Course
    events: list[Event] = Field(max_length=500)
    grading: list[Grading] = Field(max_length=100)
    policies: Policies


class ExtractedEvent(Event):
    type: GradedEventType
    counts_toward_grade: bool


class ExtractedSyllabus(Syllabus):
    events: list[ExtractedEvent] = Field(max_length=500)


class Confirm(Record):
    upload_id: Identifier
    syllabus: Syllabus


def normalize_date(raw):
    if not raw:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            return dt.date.fromisoformat(raw)
        except ValueError:
            return None
    # A slash date can only be normalized if its order and full year are clear.
    if match := re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw):
        left, right, year = map(int, match.groups())
        if left > 12 or right > 12 or left == right:
            try:
                return dt.date(year, right, left) if left > 12 else dt.date(year, left, right)
            except ValueError:
                return None
    for pattern in ("%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%b %d %Y", "%d %B %Y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    return None


def normalize_time(raw):
    if raw:
        for pattern in ("%H:%M", "%I:%M%p", "%I%p"):
            try:
                return dt.datetime.strptime(raw.replace(" ", "").replace(".", "").upper(), pattern).time()
            except ValueError:
                continue
    return None


def decode_extraction(result, course_id):
    extracted = ExtractedSyllabus.model_validate_json(result, strict=True)
    events = [
        Event(
            **event.model_dump(exclude={"counts_toward_grade", "course_id", "date", "time"}),
            course_id=course_id,
            date=normalize_date(event.date_text),
            time=normalize_time(event.time_text),
        )
        for event in extracted.events if event.counts_toward_grade
    ]
    if not (extracted.course.model_dump(exclude_none=True) or events or extracted.grading
            or any(extracted.policies.model_dump(exclude_none=True).values())):
        raise ValueError("No syllabus information was extracted.")
    return Syllabus(course=extracted.course, events=events, grading=extracted.grading, policies=extracted.policies)
