import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CompassUI } from './compass';
import { watchLocation, type GeolocationWatcher } from './geolocation';
import { OverpassProvider } from './providers/OverpassProvider';
import { Store } from './providers/types';
import {
  bearing,
  formatDistance,
  formatRadius,
  formatWalkingTime,
  haversineDistance,
  type Coords,
} from './utils/geo';
import { openInMaps } from './utils/maps';

type AppState = 'idle' | 'locating' | 'fetching' | 'found' | 'no_stores' | 'error';

const INITIAL_RADIUS_M = 5_000;
const EXPANDED_RADIUS_M = 15_000;
const WIDER_RADIUS_M = 25_000;

// Calibration detection: if the magnetometer's recent readings are too spread,
// suggest a figure-8 wave. Tuned conservatively to avoid false positives during
// intentional rotation.
const HEADING_HISTORY_SIZE = 30;
const CALIBRATION_SPREAD_THRESHOLD = 0.05;

const provider = new OverpassProvider();

export class App {
  private compass: CompassUI;
  private state: AppState = 'idle';
  private deviceHeading = 0;
  private userCoords: Coords | null = null;
  private stores: Store[] = [];
  private storeIndex = 0;
  private store: Store | null = null;
  private bearingDeg = 0;
  private watcher: GeolocationWatcher | null = null;
  private lastSearchRadius = INITIAL_RADIUS_M;
  private headingHistory: number[] = [];
  private calibrationVisible = false;
  private toastTimer: number | null = null;

  private infoEl = document.getElementById('info-area')!;
  private startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  private cardinalEl = document.getElementById('cardinal-display')!;
  private calibrationEl = document.getElementById('calibration-hint')!;
  private toastEl = document.getElementById('toast')!;

  constructor() {
    this.compass = new CompassUI();
    this.compass.setSearching(true);
    this.startBtn.addEventListener('click', () => this.start());

    this.infoEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.next-nearest-btn')) {
        this.selectNextStore();
        return;
      }
      if (target.closest('.store-name') && this.store) {
        openInMaps(this.store.lat, this.store.lon, this.store.name);
      }
    });

    this.infoEl.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.store-name') && this.store) {
        e.preventDefault();
        this.copyStoreAddress();
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

      this.trackHeadingForCalibration(this.deviceHeading);

      if (this.state === 'found') {
        this.compass.update(this.bearingDeg, this.deviceHeading);
        this.updateCardinal();
      }
    };

    // Prefer absolute orientation on Android Chrome
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handler as EventListener);
    } else {
      window.addEventListener('deviceorientation', handler);
    }
  }

  private trackHeadingForCalibration(heading: number) {
    this.headingHistory.push(heading);
    if (this.headingHistory.length > HEADING_HISTORY_SIZE) {
      this.headingHistory.shift();
    }
    if (this.headingHistory.length < HEADING_HISTORY_SIZE) return;

    // Circular spread: 1 - mean resultant length. 0 = all identical, 1 = uniform.
    let sumCos = 0;
    let sumSin = 0;
    for (const h of this.headingHistory) {
      const r = (h * Math.PI) / 180;
      sumCos += Math.cos(r);
      sumSin += Math.sin(r);
    }
    const meanLen = Math.hypot(sumCos, sumSin) / this.headingHistory.length;
    const spread = 1 - meanLen;

    const shouldShow =
      spread > CALIBRATION_SPREAD_THRESHOLD &&
      (this.state === 'found' || this.state === 'fetching');

    if (shouldShow !== this.calibrationVisible) {
      this.calibrationVisible = shouldShow;
      this.calibrationEl.classList.toggle('visible', shouldShow);
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
    this.lastSearchRadius = radius;
    try {
      const stores = await provider.findNearby(coords, radius);

      if (stores.length === 0 && radius === INITIAL_RADIUS_M) {
        return this.fetchStores(coords, EXPANDED_RADIUS_M);
      }

      if (stores.length === 0) {
        this.setState('no_stores');
        return;
      }

      this.stores = stores;
      this.storeIndex = 0;
      this.store = stores[0];
      this.updateBearing(coords);
      this.setState('found');
    } catch (err) {
      this.setState('error', (err as Error).message ?? 'Could not reach store data.');
    }
  }

  private selectNextStore() {
    if (this.stores.length < 2 || !this.userCoords) return;
    this.storeIndex = (this.storeIndex + 1) % this.stores.length;
    this.store = this.stores[this.storeIndex];
    this.updateBearing(this.userCoords);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  private searchWider() {
    if (!this.userCoords) return;
    this.fetchStores(this.userCoords, WIDER_RADIUS_M);
  }

  private async copyStoreAddress() {
    if (!this.store) return;
    const text = this.store.address ?? this.store.name;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(`Copied: ${text}`);
    } catch {
      this.showToast('Could not copy');
    }
  }

  private showToast(message: string) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
      this.toastTimer = null;
    }, 2000);
  }

  private updateCardinal() {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(this.bearingDeg / 45) % 8];
    this.cardinalEl.textContent = cardinal;
    this.cardinalEl.classList.add('visible');
  }

  private hideCardinal() {
    this.cardinalEl.classList.remove('visible');
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

    if (state !== 'found') this.hideCardinal();

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
          this.updateCardinal();
          Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        }
        break;

      case 'no_stores': {
        const triedWider = this.lastSearchRadius >= WIDER_RADIUS_M;
        const lastLabel = formatRadius(this.lastSearchRadius);

        this.infoEl.innerHTML = `
          <span class="error-title">Nothing Nearby</span>
          <span class="error-body">No liquor stores found within ${lastLabel}.</span>`;

        if (triedWider) {
          this.startBtn.textContent = 'Try Again';
          this.startBtn.onclick = () => this.resetToIdle();
        } else {
          this.startBtn.textContent = `Search ${formatRadius(WIDER_RADIUS_M)}`;
          this.startBtn.onclick = () => this.searchWider();
        }
        this.startBtn.classList.remove('hidden');
        break;
      }

      case 'error':
        this.infoEl.innerHTML = `
          <span class="error-title">Error</span>
          <span class="error-body">${errorMsg ?? 'Something went wrong.'}</span>`;
        this.startBtn.textContent = 'Retry';
        this.startBtn.classList.remove('hidden');
        this.startBtn.onclick = () => this.resetToIdle();
        break;
    }
  }

  private resetToIdle() {
    this.watcher?.stop();
    this.watcher = null;
    this.userCoords = null;
    this.store = null;
    this.stores = [];
    this.storeIndex = 0;
    this.lastSearchRadius = INITIAL_RADIUS_M;
    this.setState('idle');
    this.startBtn.textContent = 'Find Nearest Store';
    this.startBtn.onclick = () => this.start();
  }

  private renderStoreInfo(store: Store, distM: number) {
    const statusLabel = {
      open: 'Open',
      closed: 'Closed',
      unknown: 'Hours unknown',
    }[store.openStatus];

    const hasMore = this.stores.length > 1;
    const nextLabel = hasMore ? `Next nearest (${this.storeIndex + 1}/${this.stores.length}) →` : '';

    this.infoEl.innerHTML = `
      <span class="store-name" role="link" tabindex="0">${escapeHtml(store.name)}</span>
      <span class="store-distance">${formatDistance(distM)} · ${formatWalkingTime(distM)}</span>
      ${store.address ? `<span class="store-address">${escapeHtml(store.address)}</span>` : ''}
      <span class="status-badge status-${store.openStatus}">
        <span class="status-dot"></span>${statusLabel}
      </span>
      ${hasMore ? `<button class="next-nearest-btn" type="button">${nextLabel}</button>` : ''}
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
