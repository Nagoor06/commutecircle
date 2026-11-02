import math
import sqlite3
from pathlib import Path

import sqlite_vec


def passages():
    source = Path(__file__).with_name("guide.md").read_text(encoding="utf-8")
    result = []
    for section in source.split("\n## ")[1:]:
        title, text = section.strip().split("\n", 1)
        result.append(
            {
                "title": title,
                "text": text.strip(),
                "anchor": title.lower().replace(" ", "-"),
            }
        )
    return result


def vector(values, size):
    if (
        len(values) != size
        or not all(math.isfinite(v) for v in values)
        or not any(values)
    ):
        raise ValueError("Invalid embedding")
    return sqlite_vec.serialize_float32(values)


class GuideIndex:
    def __init__(self, model):
        self.docs = passages()
        embeddings = model.embed([d["title"] + ". " + d["text"] for d in self.docs])
        if len(embeddings) != len(self.docs) or not embeddings[0]:
            raise ValueError("Incomplete corpus embeddings")
        self.size = len(embeddings[0])
        # The WSGI worker owns this connection; rebuild from the versioned guide on restart.
        self.db = sqlite3.connect(":memory:")
        self.db.enable_load_extension(True)
        sqlite_vec.load(self.db)
        self.db.enable_load_extension(False)
        self.db.execute(
            f"CREATE VIRTUAL TABLE guide USING vec0(v float[{self.size}] distance_metric=cosine)"
        )
        self.db.executemany(
            "INSERT INTO guide(rowid,v) VALUES(?,?)",
            [(i + 1, vector(v, self.size)) for i, v in enumerate(embeddings)],
        )

    def search(self, embedding):
        rows = self.db.execute(
            "SELECT rowid,distance FROM guide WHERE v MATCH ? AND k=3 ORDER BY distance",
            (vector(embedding, self.size),),
        )
        return [self.docs[i - 1] for i, distance in rows if distance <= 0.62]
