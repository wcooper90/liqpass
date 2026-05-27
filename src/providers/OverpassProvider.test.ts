import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prevent units.ts (imported transitively via geo.ts) from touching navigator.
vi.mock('../utils/units', () => ({ useImperial: false }));

import { OverpassProvider } from './OverpassProvider';

type FakeElement = {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function makeResponse(elements: FakeElement[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ elements }),
  } as unknown as Response;
}

const CENTER = { lat: 51.5, lon: -0.1 };

describe('OverpassProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns stores sorted nearest-first', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        { type: 'node', id: 1, lat: 51.51, lon: -0.1, tags: { name: 'Far Store' } },
        { type: 'node', id: 2, lat: 51.501, lon: -0.1, tags: { name: 'Near Store' } },
      ])
    );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores[0].name).toBe('Near Store');
    expect(stores[1].name).toBe('Far Store');
  });

  it('prefers a confirmed-open store over a closer unknown-hours store', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 14, 0, 0)); // Wed 2pm

    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        // Unknown hours at ~111 m north of CENTER
        { type: 'node', id: 1, lat: 51.501, lon: -0.1, tags: { name: 'Closer Unknown' } },
        // Confirmed open at ~445 m north of CENTER (closer than 111 + 500 m penalty)
        {
          type: 'node', id: 2, lat: 51.504, lon: -0.1,
          tags: { name: 'Farther Open', opening_hours: '24/7' },
        },
      ])
    );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores[0].name).toBe('Farther Open');
    expect(stores[1].name).toBe('Closer Unknown');
  });

  it('uses brand tag when name is absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([{ type: 'node', id: 1, lat: 51.5, lon: -0.1, tags: { brand: 'LCBO' } }])
    );

    const [store] = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(store.name).toBe('LCBO');
  });

  it('falls back to generic name when neither name nor brand is present', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([{ type: 'node', id: 1, lat: 51.5, lon: -0.1, tags: {} }])
    );

    const [store] = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(store.name).toBe('Liquor Store');
  });

  it('reads coordinates from way center', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        { type: 'way', id: 99, center: { lat: 51.5, lon: -0.1 }, tags: { name: 'Way Store' } },
      ])
    );

    const [store] = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(store.lat).toBe(51.5);
    expect(store.lon).toBe(-0.1);
  });

  it('skips elements with out-of-range or non-finite coordinates', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        // @ts-expect-error — simulating bad server response
        { type: 'node', id: 1, lat: 'oops', lon: -0.1, tags: { name: 'String Lat' } },
        { type: 'node', id: 2, lat: NaN, lon: -0.1, tags: { name: 'NaN Lat' } },
        { type: 'node', id: 3, lat: 91, lon: -0.1, tags: { name: 'Out of Range' } },
        { type: 'node', id: 4, lat: 51.5, lon: -0.1, tags: { name: 'Good Store' } },
      ])
    );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe('Good Store');
  });

  it('skips elements with no resolvable coordinates', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        { type: 'way', id: 1, tags: { name: 'No Coords' } }, // no lat/lon/center
        { type: 'node', id: 2, lat: 51.5, lon: -0.1, tags: { name: 'Good Store' } },
      ])
    );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe('Good Store');
  });

  it('filters out confirmed-closed stores', async () => {
    vi.useFakeTimers();
    // Pin to Wednesday 14:00 (day=3)
    vi.setSystemTime(new Date(2026, 4, 20, 14, 0, 0)); // Wed 20 May 2026 14:00

    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        {
          type: 'node', id: 1, lat: 51.5, lon: -0.1,
          tags: { name: 'Open Now', opening_hours: 'Mo-Su 09:00-22:00' },
        },
        {
          type: 'node', id: 2, lat: 51.501, lon: -0.1,
          // Closes at noon on weekdays — it's 14:00, so confirmed closed.
          tags: { name: 'Closed Now', opening_hours: 'Mo-Fr 09:00-12:00' },
        },
      ])
    );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores.map((s) => s.name)).toContain('Open Now');
    expect(stores.map((s) => s.name)).not.toContain('Closed Now');
  });

  it('keeps stores with unknown opening hours', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([{ type: 'node', id: 1, lat: 51.5, lon: -0.1, tags: { name: 'No Hours' } }])
    );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores).toHaveLength(1);
    expect(stores[0].openStatus).toBe('unknown');
  });

  it('constructs the address from addr tags', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse([
        {
          type: 'node', id: 1, lat: 51.5, lon: -0.1,
          tags: {
            name: 'Addressed Store',
            'addr:housenumber': '42',
            'addr:street': 'High Street',
            'addr:city': 'London',
          },
        },
      ])
    );

    const [store] = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(store.address).toBe('42 High Street, London');
  });

  it('falls back to second Overpass endpoint on first failure', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(
        makeResponse([{ type: 'node', id: 1, lat: 51.5, lon: -0.1, tags: { name: 'Backup Store' } }])
      );

    const stores = await new OverpassProvider().findNearby(CENTER, 5_000);
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe('Backup Store');
  });

  it('throws when all endpoints fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    await expect(new OverpassProvider().findNearby(CENTER, 5_000)).rejects.toThrow();
  });

  it('throws when an endpoint returns a non-OK HTTP status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockRejectedValueOnce(new Error('also dead'));

    await expect(new OverpassProvider().findNearby(CENTER, 5_000)).rejects.toThrow();
  });
});
