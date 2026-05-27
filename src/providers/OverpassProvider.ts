import { Coords, haversineDistance } from '../utils/geo';
import { isOpenNow } from '../utils/openingHours';
import { Store, StoreProvider } from './types';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function buildQuery(center: Coords, radiusMeters: number): string {
  // Use a square bounding box approximation — fast and good enough
  const latDelta = radiusMeters / 111_320;
  const lonDelta =
    radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180));

  const s = center.lat - latDelta;
  const n = center.lat + latDelta;
  const w = center.lon - lonDelta;
  const e = center.lon + lonDelta;
  const bbox = `${s},${w},${n},${e}`;

  return `
[out:json][timeout:10];
(
  node["shop"="alcohol"](${bbox});
  node["shop"="liquor_store"](${bbox});
  way["shop"="alcohol"](${bbox});
  way["shop"="liquor_store"](${bbox});
);
out center tags;
`.trim();
}

async function fetchFromEndpoint(
  endpoint: string,
  query: string
): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status}`);
    }
    return res.json() as Promise<OverpassResponse>;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseElements(
  elements: OverpassElement[],
  center: Coords
): Store[] {
  const stores: Store[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const tags = el.tags ?? {};
    const name = tags['name'] ?? tags['brand'] ?? 'Liquor Store';
    const openingHoursTag = tags['opening_hours'];

    const openStatus = openingHoursTag
      ? isOpenNow(openingHoursTag)
      : 'unknown';

    // Skip confirmed-closed stores (but keep unknown-hours stores)
    if (openStatus === 'closed') continue;

    const city = tags['addr:city'];
    const street = tags['addr:street'];
    const housenumber = tags['addr:housenumber'];
    let address: string | undefined;
    if (street) {
      address = housenumber ? `${housenumber} ${street}` : street;
      if (city) address += `, ${city}`;
    } else if (city) {
      address = city;
    }

    stores.push({
      id: `${el.type}/${el.id}`,
      name,
      lat,
      lon,
      openStatus,
      openingHours: openingHoursTag,
      address,
    });
  }

  // Sort by distance from user
  stores.sort(
    (a, b) =>
      haversineDistance(center, { lat: a.lat, lon: a.lon }) -
      haversineDistance(center, { lat: b.lat, lon: b.lon })
  );

  return stores;
}

export class OverpassProvider implements StoreProvider {
  async findNearby(center: Coords, radiusMeters: number): Promise<Store[]> {
    const query = buildQuery(center, radiusMeters);

    let lastError: Error | null = null;
    for (const endpoint of ENDPOINTS) {
      try {
        const data = await fetchFromEndpoint(endpoint, query);
        return parseElements(data.elements, center);
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw lastError ?? new Error('All Overpass endpoints failed');
  }
}
