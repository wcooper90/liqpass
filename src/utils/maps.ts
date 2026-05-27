import { Capacitor } from '@capacitor/core';

/**
 * Open the platform's native maps app with a pin at the given coordinates.
 * Falls back to Google Maps in a browser when not on a native platform.
 */
export function openInMaps(lat: number, lon: number, label: string): void {
  const platform = Capacitor.getPlatform();
  const encodedLabel = encodeURIComponent(label);

  let url: string;
  if (platform === 'ios') {
    // Apple Maps: search by name biased to these coordinates (`sll` =
    // search-location). `ll` would only re-center the map.
    url = `maps://?q=${encodedLabel}&sll=${lat},${lon}`;
  } else if (platform === 'android') {
    // Android Google Maps: `q=name` triggers a search and surfaces the actual
    // business listing. The previous `q=lat,lon(label)` form just dropped a
    // labeled pin without any business detail page.
    url = `geo:${lat},${lon}?q=${encodedLabel}`;
  } else {
    // Web Google Maps: include coordinates in the query to bias the search.
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${label} ${lat},${lon}`)}`;
  }

  window.open(url, '_system');
}
