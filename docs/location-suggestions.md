# Automatic location suggestions

A new booking or offer asks for the device location once. With permission, the
pickup shows the current area, rounded to two decimal places before it reaches
maps, route search or browser storage. A nearby catalogue landmark can help
identify the area. The rider chooses the destination. A driver chooses a named
public meeting point before publishing the offer. Manual pickup entry and
explicitly saved routes take priority over delayed location callbacks. A denial
or timeout leaves the fields usable and offers a retry. The planner suggests
real available rides for the selected date, stops and filters.

Both fields prefer a fresh approximate device area, retained in page memory for
five minutes. Otherwise they use the opposite selected stop, or their existing
selected point. Empty input with a mapped reference shows the nearest available
public stops. Without a reference, an empty field waits for a place name or a
location request. Typing is debounced by 360 ms; obsolete requests are aborted
and generation checks reject replies from older queries.

Search requests country code IN and rejects foreign or missing-country provider
results. Location is a bias, never a distance cutoff or bounding box. Matching
online places and offline stations are combined, deduplicated and sorted by
ascending straight-line distance before the first six are displayed. A match at
the current area is not discarded. Farther matches remain eligible without an
extra search action. Without a location reference, text relevance determines
order; the user can include a city to narrow the query. Results depend on provider
coverage and the returned candidate set, not an exhaustive global distance index.

The dropdown uses a short “Nearest matches first” hint when a reference is known.
It does not show the previous country/radius banner or scope-switch button.

Offline station codes must have a source record identifying an Indian state or
union territory. Unknown and foreign records are excluded from both the name
index and nearby catalogue. Coordinate suggestions require a nearby Indian
reverse-geocoding result; failed verification shows no suggested coordinate pin.

The cache includes query, provider and location bias. Country verification is
retained for searches with or without location access. An unavailable online lookup preserves verified local catalogue results.

The dropdown aligns to its field, keeps its action below the scrolling list,
wraps long addresses and scrolls keyboard-selected options into view. The active
field has its own stacking order so a later field cannot cover its suggestions.

Device GPS in **Find public stops near me** remains a separate browser-local
lookup, ordered by distance with no radius cutoff. Subsequent place searches may use the area rounded to two decimal
places; raw device coordinates and private live GPS are not sent to autocomplete,
RAG or model prompts.

Reference: https://github.com/komoot/photon/blob/master/docs/api-v1.md
