import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CompassUI } from './compass';
import { watchLocation, type GeolocationWatcher } from './geolocation';
import { OverpassProvider } from './providers/OverpassProvider';
import { Store } from './providers/types';
import {
  bearing,
  formatDistance,
  formatWalkingTime,
  haversineDistance,
  type Coords,
} from './utils/geo';
import { openInMaps } from './utils/maps';

type AppState = 'idle' | 'locating' | 'fetching' | 'found' | 'no_stores' | 'error';

const INITIAL_RADIUS_M = 5_000;
const EXPANDED_RADIUS_M = 15_000;

const provider = new OverpassProvider();

export class App {
  private compass: CompassUI;
  private state: AppState = 'idle';
  private deviceHeading = 0;
  private userCoords: Coords | null = null;
  private store: Store | null = null;
  private bearingDeg = 0;
  private watcher: GeolocationWatcher | null = null;

  private infoEl = document.getElementById('info-area')!;
  private startBtn = document.getElementById('start-btn') as HTMLButtonElement;

  constructor() {
    this.compass = new CompassUI();
    this.compass.setSearching(true);
    this.startBtn.addEventListener('click', () => this.start());

    this.infoEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.store-name') && this.store) {
        openInMaps(this.store.lat, this.store.lon, this.store.name);
      }
    });
  }

  private async start() {
    this.startBtn.classList.add('hidden');
    await this.requestDeviceOrientation();
    this.startDeviceOrientation();
    this.startGeolocation();
  }

  // iOS 13+ requires a user-gesture permission call for DeviceOrientationEvent
  private async requestDeviceOrientation() {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === 'function') {
      try {
        await DOE.requestPermission();
      } catch {
        // Denied or unsupported — compass will default to heading 0 (static rose)
      }
    }
  }

  private startDeviceOrientation() {
    const handler = (e: DeviceOrientationEvent) => {
      const ext = e as DeviceOrientationEvent & { webkitCompassHeading?: number };

      if (ext.webkitCompassHeading != null) {
        // iOS — already clockwise from North
        this.deviceHeading = ext.webkitCompassHeading;
      } else if (e.absolute && e.alpha != null) {
        // Android absolute — alpha is counterclockwise from North
        this.deviceHeading = (360 - e.alpha) % 360;
      } else if (e.alpha != null) {
        // Fallback — approximate
        this.deviceHeading = (360 - e.alpha) % 360;
      }

      if (this.state === 'found') {
        this.compass.update(this.bearingDeg, this.deviceHeading);
      }
    };

    // Prefer absolute orientation on Android Chrome
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handler as EventListener);
    } else {
      window.addEventListener('deviceorientation', handler);
    }
  }

  private async startGeolocation() {
    this.setState('locating');

    this.watcher = await watchLocation(
      (coords) => {
        const moved =
          !this.userCoords || haversineDistance(this.userCoords, coords) > 100;
        this.userCoords = coords;

        if (this.state === 'locating' || (this.state === 'found' && moved)) {
          this.fetchStores(coords);
        } else if (this.state === 'found' && this.store) {
          this.updateBearing(coords);
        }
      },
      (err) => this.setState('error', err.message)
    );
  }

  private async fetchStores(coords: Coords, radius = INITIAL_RADIUS_M): Promise<void> {
    this.setState('fetching');
    try {
      const stores = await provider.findNearby(coords, radius);

      if (stores.length === 0 && radius === INITIAL_RADIUS_M) {
        return this.fetchStores(coords, EXPANDED_RADIUS_M);
      }

      if (stores.length === 0) {
        this.setState('no_stores');
        return;
      }

      this.store = stores[0];
      this.updateBearing(coords);
      this.setState('found');
    } catch (err) {
      this.setState('error', (err as Error).message ?? 'Could not reach store data.');
    }
  }

  private updateBearing(coords: Coords) {
    if (!this.store) return;
    const storeCoords: Coords = { lat: this.store.lat, lon: this.store.lon };
    this.bearingDeg = bearing(coords, storeCoords);
    const distM = haversineDistance(coords, storeCoords);

    if (this.state === 'found') {
      this.compass.update(this.bearingDeg, this.deviceHeading);
      this.renderStoreInfo(this.store, distM);
    }
  }

  private setState(state: AppState, errorMsg?: string) {
    this.state = state;

    const searching = state === 'locating' || state === 'fetching';
    this.compass.setSearching(searching || state === 'idle');

    switch (state) {
      case 'idle':
        this.infoEl.innerHTML = '';
        this.startBtn.classList.remove('hidden');
        break;

      case 'locating':
        this.infoEl.innerHTML = `<span class="status-text">Finding your location…</span>`;
        break;

      case 'fetching':
        this.infoEl.innerHTML = `<span class="status-text">Searching nearby…</span>`;
        break;

      case 'found':
        this.compass.setSearching(false);
        if (this.store && this.userCoords) {
          const distM = haversineDistance(this.userCoords, {
            lat: this.store.lat,
            lon: this.store.lon,
          });
          this.renderStoreInfo(this.store, distM);
          this.compass.update(this.bearingDeg, this.deviceHeading);
          Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        }
        break;

      case 'no_stores':
        this.infoEl.innerHTML = `
          <span class="error-title">Nothing Nearby</span>
          <span class="error-body">No liquor stores found within 15 km.</span>`;
        this.startBtn.textContent = 'Try Again';
        this.startBtn.classList.remove('hidden');
        this.startBtn.onclick = () => {
          this.watcher?.stop();
          this.watcher = null;
          this.userCoords = null;
          this.store = null;
          this.setState('idle');
          this.startBtn.textContent = 'Find Nearest Store';
          this.startBtn.onclick = () => this.start();
        };
        break;

      case 'error':
        this.infoEl.innerHTML = `
          <span class="error-title">Error</span>
          <span class="error-body">${errorMsg ?? 'Something went wrong.'}</span>`;
        this.startBtn.textContent = 'Retry';
        this.startBtn.classList.remove('hidden');
        this.startBtn.onclick = () => {
          this.setState('idle');
          this.startBtn.textContent = 'Find Nearest Store';
          this.startBtn.onclick = () => this.start();
        };
        break;
    }
  }

  private renderStoreInfo(store: Store, distM: number) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(this.bearingDeg / 45) % 8];

    this.infoEl.innerHTML = `
      <span class="store-name" role="link" tabindex="0">${escapeHtml(store.name)}</span>
      <span class="store-distance">${formatDistance(distM)} · ${formatWalkingTime(distM)} · ${cardinal}</span>
      ${store.address ? `<span class="store-address">${escapeHtml(store.address)}</span>` : ''}
      ${store.openStatus === 'unknown' ? `<span class="hours-warning">Hours unknown — may be closed</span>` : ''}
    `;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
