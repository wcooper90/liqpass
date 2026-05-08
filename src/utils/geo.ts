export interface Coords {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Straight-line distance between two coordinates in meters (Haversine). */
export function haversineDistance(a: Coords, b: Coords): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lon - a.lon);

  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const h =
    sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Clockwise bearing from `from` to `to`, in degrees [0, 360). */
export function bearing(from: Coords, to: Coords): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Returns the equivalent angle in [-180, 180) so that animated rotation
 * always takes the shortest arc rather than spinning the long way around.
 */
export function shortestArc(current: number, target: number): number {
  let diff = ((target - current + 540) % 360) - 180;
  return current + diff;
}

/** Format meters as a human-readable distance string. */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Estimate walking time at ~80 m/min and format it. */
export function formatWalkingTime(meters: number): string {
  const minutes = Math.max(1, Math.round(meters / 80));
  if (minutes < 60) return `${minutes} min walk`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr walk` : `${hours} hr ${rem} min walk`;
}
