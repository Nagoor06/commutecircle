# Nearby location suggestions

Both pickup and drop-off use the selected opposite endpoint as their anchor.
Suggestions default to a 50 km straight-line radius, including the local station
catalogue, offline fallback and online Photon results. Empty input suggests
nearby public stops. Photon receives a bounding box and geographic bias; the
client also checks exact great-circle distance so square-box corners cannot
leak outside the radius. Date-line searches omit the incompatible bounding box
and retain the exact distance filter.

**Search farther away** removes the suggestion radius. Users can then select
distant cities and return with **Back to within 50 km**. Changing the anchor
resets the field to nearby suggestions. Intentional coordinate entry or map
pinning can always select farther away. This is a suggestion filter, not a
maximum journey distance or the smaller ride-matching radius. Search results
remain debounced; obsolete requests and responses cannot replace a newer query.

Device GPS used by **Find public stops near me** still stays in the browser and
uses a separate 5 km public-stop lookup. Private live trip location never enters
autocomplete, route search, RAG or model prompts.

Reference: [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md).
