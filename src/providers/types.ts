import { Coords } from '../utils/geo';

export type OpenStatus = 'open' | 'closed' | 'unknown';

export interface Store {
  id: string;
  name: string;
  lat: number;
  lon: number;
  openStatus: OpenStatus;
  openingHours?: string;
  address?: string;
}

/** Swap implementations here to switch data sources. */
export interface StoreProvider {
  findNearby(center: Coords, radiusMeters: number): Promise<Store[]>;
}
