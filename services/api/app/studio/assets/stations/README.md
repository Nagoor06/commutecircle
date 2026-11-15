Public station-area lookup, derived from [DataMeet Indian Railways](https://github.com/datameet/railways/blob/21aa4a02617bdf300cd65ee69d1a33998d7b694e/stations.json), CC0.

The index contains 4,212 unique codes whose source records explicitly identify an Indian state or union territory. A geographic bounding box alone is insufficient: the original source also contains cross-border stations. Entries without confirmed Indian state metadata are omitted; online search can still return them when its provider confirms country code IN.

Run `python scripts/filter_indian_stations.py /path/to/original/stations.json` after importing a fresh snapshot. This filters both name/code shards and the nearby-point catalogue. Historical state names in the allowlist describe source metadata, not current administrative boundaries.

Some names and codes are historical. Confirm the meeting entrance on the map. Initial-letter shards index name words and station codes. These are places, never ride listings.
