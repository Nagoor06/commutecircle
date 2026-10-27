from dataclasses import dataclass


@dataclass(frozen=True)
class Principal:
    issuer: str
    subject: str
    scopes: frozenset[str]
