"""Make a relocatable, cache-consistent Pages release from the canonical FastAPI client."""

import argparse
import hashlib
import json
from pathlib import Path
from shutil import copyfile
from urllib.parse import urlsplit

SOURCE = Path(__file__).resolve().parents[1] / "services/api/app/studio"


def build(out: Path, origin: str | None = None):
    config = json.loads((SOURCE / "app-settings.json").read_text())
    if origin:
        parsed = urlsplit(origin)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Use the exact HTTPS origin of the trusted API.")
        config["apiOrigin"] = origin.rstrip("/")
    files = sorted(
        f
        for f in SOURCE.rglob("*")
        if f.is_file() and f.name not in {"index.html", "app-settings.json"}
    )
    digest = hashlib.sha256()
    for f in files:
        digest.update(
            f.relative_to(SOURCE).as_posix().encode()
            + b"\0"
            + hashlib.sha256(f.read_bytes()).digest()
        )
    suffix = Path("releases") / digest.hexdigest()[:16]
    for f in files:
        dest = out / suffix / f.relative_to(SOURCE)
        dest.parent.mkdir(parents=True, exist_ok=True)
        copyfile(f, dest)
    html = (
        (SOURCE / "index.html")
        .read_text()
        .replace('href="./', f'href="./{suffix.as_posix()}/')
        .replace('src="./', f'src="./{suffix.as_posix()}/')
    )
    (out / "index.html").write_text(html)
    (out / "app-settings.json").write_text(json.dumps(config, indent=2) + "\n")
    return suffix


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--api-origin", help="Trusted hosted API origin")
    args = parser.parse_args()
    print(build(args.out, args.api_origin))
