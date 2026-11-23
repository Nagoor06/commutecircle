import { coordinate, frame, offlineStyle, pinData, roadRoute, routeLine } from '../src/mapData';
import { jsonRequest } from '../src/api';
jest.mock('../src/api', () => ({ jsonRequest: jest.fn() }));

test('manual names have no invented pins, zero is valid and invalid coordinates are omitted', () => {
  expect(coordinate({ name: 'Central Station' })).toBeNull();
  expect(coordinate({ name: '0, 0' })).toEqual([0, 0]);
  expect(coordinate({ name: 'Stop', lat: 2, lon: NaN })).toBeNull();
  expect(pinData([null, [0, 0]]).features[0].properties?.role).toBe('dropoff');
  expect(frame([]).zoom).toBeLessThan(2);
  expect(frame([[5, 6], [5, 6]]).zoom).toBe(14);
  expect(offlineStyle.sources['cc-overview'].type).toBe('geojson');
});
test('the Pacific date line fits across the short arc and splits the direct overlay', () => {
  expect(frame([[179, 2], [-179, 4]])).toMatchObject({ bounds: [179, 2, 181, 4] });
  expect(routeLine([[179, 2], [-179, 4]])).toEqual({
    type: 'MultiLineString', coordinates: [[[179, 2], [180, 3]], [[-180, 3], [-179, 4]]],
  });
});
test('road routing carries the cancel signal and validates returned geometry', async () => {
  const signal = new AbortController().signal;
  const mock = jest.mocked(jsonRequest);
  const geometry = { coordinates: [[0, 0], [1, 1]] };
  mock.mockResolvedValueOnce({ code: 'Ok', routes: [{ distance: 2000, duration: 300, geometry }] });
  await expect(roadRoute([[0, 0], [1, 1]], signal)).resolves.toMatchObject({ distance: 2000, duration: 300 });
  expect(mock.mock.calls[0][1]?.signal).toBe(signal);
  mock.mockResolvedValueOnce({ code: 'Ok', routes: [{ distance: 2000, duration: 300, geometry: {coordinates: [[0, 0], [999, 1]]} }] });
  await expect(roadRoute([[0, 0], [1, 1]], signal)).rejects.toThrow('Road route unavailable');
});
