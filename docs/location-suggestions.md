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
selected point. Empty input with a mapped anchor suggests public stops within
25 km (straight line). An empty field
with no anchor waits for the user to type a place or request nearby stops. Typing is debounced by 360 ms; obsolete
requests are aborted and generation checks reject replies from older queries.

Search requests country code IN and rejects foreign or missing-country provider
results. A query with a location reference is bounded to 25 km; it never widens
automatically. **Search across India** explicitly removes that radius while
retaining the country restriction. **Search nearby** restores it, and editing
the query also returns to nearby scope. Without GPS or a mapped reference,
results remain India-only and the user can add their city to the query. The
radius is a proximity limit, not an administrative city boundary.

Offline station codes must have a source record identifying an Indian state or
union territory. Unknown and foreign records are excluded from both the name
index and nearby catalogue. Coordinate suggestions require a nearby Indian
reverse-geocoding result; failed verification shows no suggested coordinate pin.

The cache includes query, provider, anchor and geographic scope. Date-line
searches omit an invalid bounding box and retain exact distance and country
checks. An unavailable online lookup preserves verified local catalogue results.

The dropdown aligns to its field, keeps its action below the scrolling list,
wraps long addresses and scrolls keyboard-selected options into view. The active
field has its own stacking order so a later field cannot cover its suggestions.

Device GPS in **Find public stops near me** remains a separate browser-local
5 km lookup. Subsequent place searches may use the area rounded to two decimal
places; raw device coordinates and private live GPS are not sent to autocomplete,
RAG or model prompts.

Reference: https://github.com/komoot/photon/blob/master/docs/api-v1.md
