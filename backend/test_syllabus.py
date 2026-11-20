import json
import unittest

from pydantic import ValidationError

from .syllabus import Confirm, decode_extraction


class SyllabusExtractionTest(unittest.TestCase):
    def test_normalizes_dates_and_preserves_uncertain_source_text(self):
        upload_id = "a" * 32
        syllabus = decode_extraction(json.dumps({
            "course": {"code": "MATH 2410", "semester": "Fall 2026"},
            "events": [
                {"title": "Final exam", "type": "exam", "date_text": "December 10, 2026", "time_text": "2:30 p.m."},
                {"title": "Presentation", "type": "presentation", "date_text": "Dec 3–5"},
                {"title": "Project", "type": "project", "date_text": "11/4/2026"},
                {"title": "Quiz", "type": "quiz", "date_text": "February 30, 2026"},
            ],
            "grading": [{"category": "Final exam", "weight": 30}, {"category": "Project"}],
            "policies": {"letter_grades": [{"letter": "A", "threshold": "90–100%"}]},
        }), upload_id).model_dump(mode="json")

        first, *uncertain = syllabus["events"]
        self.assertEqual(first["course_id"], upload_id)
        self.assertEqual(first["date"], "2026-12-10")
        self.assertEqual(first["time"], "14:30:00")
        self.assertTrue(all(event["date"] is None for event in uncertain))
        self.assertEqual([event["date_text"] for event in uncertain], ["Dec 3–5", "11/4/2026", "February 30, 2026"])
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
