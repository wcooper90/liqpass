import { Capacitor } from '@capacitor/core';

/**
 * Open the platform's native maps app with a pin at the given coordinates.
 * Falls back to Google Maps in a browser when not on a native platform.
 */
export function openInMaps(
  lat: number,
  lon: number,
  label: string,
  address?: string
): void {
  const platform = Capacitor.getPlatform();
  // Including the address disambiguates generic store names ("Liquor Store",
  // "Off Licence") from unrelated businesses with the same name nearby.
  const searchTerm = address ? `${label} ${address}` : label;
  const encodedTerm = encodeURIComponent(searchTerm);

  let url: string;
  if (platform === 'ios') {
    // Apple Maps: search by name+address biased to these coordinates (`sll` =
    // search-location). `ll` would only re-center the map.
    url = `maps://?q=${encodedTerm}&sll=${lat},${lon}`;
  } else if (platform === 'android') {
    // Android Google Maps: `q=name` triggers a search and surfaces the actual
    // business listing. The previous `q=lat,lon(label)` form just dropped a
    // labeled pin without any business detail page.
    url = `geo:${lat},${lon}?q=${encodedTerm}`;
  } else {
    // Web Google Maps: include coordinates in the query to bias the search.
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${searchTerm} ${lat},${lon}`)}`;
  }

  window.open(url, '_system');
}
