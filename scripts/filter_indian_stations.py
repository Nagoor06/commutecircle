"""Restrict the bundled index to station codes explicitly located in an Indian state."""

import argparse
import json
from pathlib import Path

INDIAN_STATES = {
    "Andaman and Nicobar Islands",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Dadra and Nagar Haveli",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Daman and Diu",
    "Delhi",
    "Delhi NCT",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Orissa",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
}


def restrict(source, root):
    allowed = {
        p["code"]
        for feature in source["features"]
        if (p := feature["properties"]).get("state") in INDIAN_STATES
    }
    points, codes = set(), set()
    for path in sorted(root.glob("*.json")):
        if path.name == "nearby.json":
            continue
        rows = [r for r in json.loads(path.read_text()) if r[1] in allowed]
        path.write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        codes.update(r[1] for r in rows)
        points.update((r[2], r[3]) for r in rows)
    nearby = root / "nearby.json"
    rows = [r for r in json.loads(nearby.read_text()) if (r[1], r[2]) in points]
    nearby.write_text(
        json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(f"Kept {len(codes)} station codes and {len(rows)} nearby public areas")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Original DataMeet stations.json")
    args = parser.parse_args()
    restrict(
        json.loads(args.source.read_text()),
        Path(__file__).resolve().parents[1] / "services/api/app/studio/assets/stations",
    )
