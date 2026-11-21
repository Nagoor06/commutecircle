"""Create a Digital Asset Links entry from a real app-signing fingerprint."""

import argparse
import json
import re
from pathlib import Path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fingerprint", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    fingerprint = args.fingerprint.upper()
    if not re.fullmatch(r"(?:[0-9A-F]{2}:){31}[0-9A-F]{2}", fingerprint):
        parser.error(
            "Use the SHA-256 app-signing certificate fingerprint from Play Console."
        )
    data = [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "io.github.nagoor06.commutecircle",
                "sha256_cert_fingerprints": [fingerprint],
            },
        }
    ]
    with args.out.open("x") as output:
        json.dump(data, output, indent=2)
        output.write("\n")
