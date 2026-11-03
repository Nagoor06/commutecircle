import unittest

from retrieval import passages
from workflow import build_graph


class Model:
    """Deterministic embeddings for testing SQLite vector search and real graph edges."""

    choice = 1
    selections = 0

    def embed(self, texts):
        topics = [p["title"].lower() for p in passages()]
        vectors = []
        for text in texts:
            idx = next(
                (i for i, topic in enumerate(topics) if text.lower().startswith(topic)),
                len(topics),
            )
            vectors.append([float(i == idx) for i in range(len(topics) + 1)])
        return vectors

    def select(self, question, evidence):
        self.selections += 1
        return self.choice


class GuideTests(unittest.TestCase):
    def setUp(self):
        self.model = Model()
        self.graph = build_graph(self.model)

    def ask(self, question):
        return self.graph.invoke({"question": question})["answer"]

    def test_citations_and_no_external_text(self):
        result = self.ask("Booking commitment")
        self.assertIn("sandbox money", result["answer"])
        self.assertTrue(result["sources"][0]["url"].endswith("#booking-commitment"))

    def test_no_hit_bypasses_generation(self):
        self.assertEqual(self.ask("Tomorrow's weather")["status"], "no_evidence")
        self.assertEqual(self.model.selections, 0)

    def test_invalid_and_abstaining_model_choices(self):
        for self.model.choice in [0, 99, True, "insert text"]:
            self.assertEqual(self.ask("Last seat")["sources"], [])
