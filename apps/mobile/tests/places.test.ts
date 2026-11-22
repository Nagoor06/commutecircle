import { km, suggestions, wirePlace } from '../src/places';
test('nearest international stops come first, duplicates are removed, and only approximate bias leaves the device', async () => {
  const places = [
    ['Overseas', 179, 1],
    ['Local', -179.99, 0],
    ['Local', -179.99, 0],
    ['Invalid', 220, 1],
  ];
  const request = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      features: places.map(([name, lon, lat]) => ({
        properties: { name },
        geometry: { coordinates: [lon, lat] },
      })),
    }),
  }));
  globalThis.fetch = request as unknown as typeof fetch;
  const anchor = { lat: 0.0042, lon: 179.9914 };
  const matches = await suggestions('stop', anchor, new AbortController().signal);
  expect(matches.map((m) => m.name)).toEqual(['Local', 'Overseas']);
  expect(km(anchor, matches[0])).toBeLessThan(km(anchor, matches[1]));
  const params = new URL(String((request.mock.calls as unknown[][])[0][0])).searchParams;
  expect(params.get('lon')).toBe('179.99');
  expect(params.has('bbox')).toBe(false);
  expect(params.has('countrycode')).toBe(false);
  expect(wirePlace({ name: '  Civic Station  ' })).toEqual({ name: 'Civic Station' });
});

test('typed coordinates work offline for suggestions and ride search', async () => {
  const fetch = jest.fn();
  globalThis.fetch = fetch;
  const name = '51.50, -0.12';
  expect((await suggestions(name, undefined, new AbortController().signal))[0]).toMatchObject({
    lat: 51.5,
    lon: -0.12,
  });
  expect(wirePlace({ name })).toEqual({ name, lat: 51.5, lon: -0.12 });
  expect(fetch).not.toHaveBeenCalled();
});
