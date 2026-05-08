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
    url = `maps://?q=${encodedLabel}&ll=${lat},${lon}`;
  } else if (platform === 'android') {
    url = `geo:${lat},${lon}?q=${lat},${lon}(${encodedLabel})`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }

  window.open(url, '_system');
}
