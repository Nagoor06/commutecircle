import json
import sqlite3
from functools import lru_cache
from wsgiref.simple_server import make_server

from inference import Ollama
from workflow import build_graph


@lru_cache(maxsize=1)
def graph():
    return build_graph(Ollama())


def app(env, start):
    status, result = "404 Not Found", {}
    if env["PATH_INFO"] == "/ask" and env["REQUEST_METHOD"] == "POST":
        try:
            length = int(env.get("CONTENT_LENGTH") or 0)
            if not 1 <= length <= 4096:
                raise ValueError
            question = json.loads(env["wsgi.input"].read(length))["question"].strip()
            if not 1 <= len(question) <= 300:
                raise ValueError
        except (KeyError, ValueError, AttributeError, TypeError):
            status, result = "400 Bad Request", {}
        else:
            try:
                result = graph().invoke({"question": question})["answer"]
                status = "200 OK"
            except (OSError, ValueError, KeyError, TypeError, sqlite3.Error):
                # Do not log prompts or upstream model response bodies.
                status, result = (
                    "503 Service Unavailable",
                    {"detail": "Ride help unavailable"},
                )
    start(status, [("Content-Type", "application/json"), ("Cache-Control", "no-store")])
    return [json.dumps(result).encode()]


if __name__ == "__main__":
    with make_server("0.0.0.0", 8090, app) as server:
        server.serve_forever()
