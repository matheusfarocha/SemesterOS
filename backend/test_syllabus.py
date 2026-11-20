import json
import unittest

from pydantic import ValidationError

from .syllabus import Confirm, decode_extraction, normalize_date
from .workspace import DATE_REVIEW_VERSION, decode_confirmed


class SyllabusExtractionTest(unittest.TestCase):
    def test_resolves_shorthand_dates_using_the_term_and_weekday(self):
        for raw, expected in (("12/21 (Mo)", "2026-12-21"), ("11/04 (We)", "2026-11-04")):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_date(raw, "Fall 2026").isoformat(), expected)
        for raw in ("Week 15", "11/04", "11/04 (Tu)", "02/30"):
            with self.subTest(raw=raw):
                self.assertIsNone(normalize_date(raw, "Fall 2026"))
        self.assertIsNone(normalize_date("11/04 (We)"))

    def test_old_confirmed_dates_are_normalized_but_reviewed_dates_stay_as_saved(self):
        snapshot = {
            "course": {"course": {"semester": "Fall 2026"}},
            "events": [{"id": "exam", "date": None, "time": None, "date_text": "11/04 (We)"}],
        }
        self.assertEqual(decode_confirmed(json.dumps(snapshot))["events"][0]["date"], "2026-11-04")
        snapshot["dates_reviewed"] = True
        self.assertIsNone(decode_confirmed(json.dumps(snapshot))["events"][0]["date"])

    def test_backfills_full_slash_dates_from_earlier_reviews(self):
        for raw, expected in (("10/8/2026", "2026-10-08"), ("11/12/2026", "2026-11-12")):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_date(raw).isoformat(), expected)
                snapshot = {
                    "course": {"course": {}},
                    "events": [{"id": "exam", "date": None, "time": None, "date_text": raw}],
                    "dates_reviewed": True,
                }
                self.assertEqual(decode_confirmed(json.dumps(snapshot))["events"][0]["date"], expected)
                snapshot["dates_reviewed"] = DATE_REVIEW_VERSION
                self.assertIsNone(decode_confirmed(json.dumps(snapshot))["events"][0]["date"])
        self.assertEqual(normalize_date("21/12/2026").isoformat(), "2026-12-21")
        self.assertIsNone(normalize_date("02/30/2026"))

    def test_normalizes_dates_and_preserves_uncertain_source_text(self):
        upload_id = "a" * 32
        syllabus = decode_extraction(json.dumps({
            "course": {"code": "MATH 2410", "semester": "Fall 2026"},
            "events": [
                {"title": "Final exam", "type": "exam", "counts_toward_grade": True,
                 "date_text": "December 10, 2026", "time_text": "2:30 p.m."},
                {"title": "Presentation", "type": "presentation", "counts_toward_grade": True, "date_text": "Dec 3–5"},
                {"title": "Project", "type": "project", "counts_toward_grade": True, "date_text": "11/4/2026"},
                {"title": "Quiz", "type": "quiz", "counts_toward_grade": True, "date_text": "February 30, 2026"},
            ],
            "grading": [{"category": "Final exam", "weight": 30}, {"category": "Project"}],
            "policies": {"letter_grades": [{"letter": "A", "threshold": "90–100%"}]},
        }), upload_id).model_dump(mode="json")

        first, presentation, project, quiz = syllabus["events"]
        self.assertEqual(first["course_id"], upload_id)
        self.assertEqual(first["date"], "2026-12-10")
        self.assertEqual(first["time"], "14:30:00")
        self.assertNotIn("counts_toward_grade", first)
        self.assertEqual(project["date"], "2026-11-04")
        self.assertEqual(project["date_text"], "11/4/2026")
        self.assertTrue(all(event["date"] is None for event in (presentation, quiz)))
        self.assertEqual([event["date_text"] for event in (presentation, quiz)], ["Dec 3–5", "February 30, 2026"])
        self.assertIsNone(syllabus["course"]["professor"])
        self.assertIsNone(syllabus["policies"]["attendance"])
        self.assertEqual(syllabus["grading"], [{"category": "Final exam", "weight": 30}, {"category": "Project", "weight": None}])
        self.assertEqual(syllabus["policies"]["letter_grades"], [{"letter": "A", "threshold": "90–100%"}])

    def test_rejects_invalid_or_empty_model_data(self):
        for response in ('{"events": []}', '{"course":{},"policies":{},"grading":[],"events":[]}'):
            with self.subTest(response=response), self.assertRaises(ValueError):
                decode_extraction(response, "a" * 32)

    def test_rejects_invalid_confirmation(self):
        with self.assertRaises(ValidationError) as error:
            Confirm.model_validate({
                "upload_id": "a" * 32,
                "syllabus": {
                    "course": {"name": "Calculus"},
                    "events": [{"title": "Exam", "date": "2026-02-30", "time": "11:00-05:00"}],
                    "grading": [{"category": "Exams", "weight": 110}],
                    "policies": {},
                },
            })
        self.assertEqual(error.exception.error_count(), 3)
