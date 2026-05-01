import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { Coords } from './utils/geo';

export type GeolocationErrorCode = 'denied' | 'unavailable' | 'unknown';

export interface GeolocationError {
  code: GeolocationErrorCode;
  message: string;
}

export interface GeolocationWatcher {
  stop: () => void;
}

/**
 * Watch the user's position. Uses Capacitor's native plugin on iOS/Android
 * (which routes through OS location services with proper permission prompts),
 * and falls back to the browser Geolocation API in dev/web.
 */
export async function watchLocation(
  onUpdate: (coords: Coords) => void,
  onError: (err: GeolocationError) => void
): Promise<GeolocationWatcher> {
  if (Capacitor.isNativePlatform()) {
    return watchNative(onUpdate, onError);
  }
  return watchBrowser(onUpdate, onError);
}

async function watchNative(
  onUpdate: (coords: Coords) => void,
  onError: (err: GeolocationError) => void
): Promise<GeolocationWatcher> {
  try {
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      onError({ code: 'denied', message: 'Location permission denied.' });
      return { stop: () => {} };
    }
  } catch (e) {
    onError({ code: 'unknown', message: String((e as Error).message ?? e) });
    return { stop: () => {} };
  }

  const watchId = await Geolocation.watchPosition(
    { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    (pos, err) => {
      if (err) {
        onError({ code: 'unknown', message: err.message });
        return;
      }
      if (pos) {
        onUpdate({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }
    }
  );

  return {
    stop: () => {
      Geolocation.clearWatch({ id: watchId }).catch(() => {});
    },
  };
}

function watchBrowser(
  onUpdate: (coords: Coords) => void,
  onError: (err: GeolocationError) => void
): GeolocationWatcher {
  if (!navigator.geolocation) {
    onError({ code: 'unavailable', message: 'Geolocation is not supported by your browser.' });
    return { stop: () => {} };
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    (err) => {
      const code: GeolocationErrorCode =
        err.code === err.PERMISSION_DENIED ? 'denied' : 'unknown';
      const message =
        err.code === err.PERMISSION_DENIED
          ? 'Location access denied. Enable it in your browser settings.'
          : 'Could not determine your location.';
      onError({ code, message });
    },
    { enableHighAccuracy: true, maximumAge: 30_000 }
  );

  return { stop: () => navigator.geolocation.clearWatch(id) };
}
