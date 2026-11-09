# Automatic location suggestions

Both fields use the opposite selected stop as their anchor. Empty input suggests
public stops within 50 km (straight line). Typing is debounced by 360 ms; obsolete
requests are aborted and generation checks reject replies from older queries.

Search first asks Photon for nearby matches with geographic bias and a bounding
box. If there is no exact nearby match, it automatically asks for wider matches.
An exact distant name, or a matching city/town prefix, can outrank nearby businesses
that contain that place name. Ambiguous equally relevant matches stay nearby.
With no nearby match, search expands automatically, including offline railway
stations. There is no range button. Coordinates and map pins have no 50 km limit.

The cache includes query, provider and anchor. Date-line searches omit the invalid
bounding box and retain exact great-circle distance checks. An unavailable wider
lookup preserves existing local results and reports partial availability.

The dropdown aligns to its field, keeps its action below the scrolling list,
wraps long addresses and scrolls keyboard-selected options into view. The active
field has its own stacking order so a later field cannot cover its suggestions.

Device GPS in **Find public stops near me** remains a separate browser-local
5 km lookup. Private live GPS is never sent to autocomplete, RAG or model prompts.

Reference: https://github.com/komoot/photon/blob/master/docs/api-v1.md
