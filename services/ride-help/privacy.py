import re
import unicodedata


def private_input(question):
    text = "".join(
        c
        for c in unicodedata.normalize("NFKC", question)
        if not unicodedata.category(c).startswith("C")
    )
    return sum(c.isdecimal() for c in text) >= 7 or bool(
        re.search(
            r"\S+@\S+|bearer\s+\S+|(?:my home|home address|i live)\s+(?:is|at)\b",
            text,
            re.I,
        )
    )


def privacy_answer():
    return {
        "status": "private_input",
        "answer": "Please remove phone numbers, email addresses, precise coordinates and home details. Ask a general commute question instead.",
        "sources": [],
    }
