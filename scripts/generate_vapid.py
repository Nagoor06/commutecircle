"""Generate stable Web Push credentials into an untracked file, never stdout."""

import argparse
import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def generate(path: Path, subject: str):
    key = ec.generate_private_key(ec.SECP256R1())

    def encode(value):
        return base64.urlsafe_b64encode(value).decode().rstrip("=")

    values = {
        "VAPID_PRIVATE_KEY": encode(
            key.private_numbers().private_value.to_bytes(32, "big")
        ),
        "VAPID_PUBLIC_KEY": encode(
            key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        ),
        "VAPID_SUBJECT": subject,
    }
    # Refuse accidental key rotation: existing devices depend on this key.
    with os.fdopen(
        os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w"
    ) as file:
        json.dump(values, file, indent=2)
        file.write("\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--subject", default="https://nagoor06.github.io/commutecircle/"
    )
    args = parser.parse_args()
    generate(args.out, args.subject)
    print(
        "Created credentials. Store them in the API service environment; do not commit this file."
    )
