/**
 * Google Maps Places SDK provider — stub for future implementation.
 *
 * To activate:
 * 1. Install: `npx expo install react-native-google-places-sdk` (or similar)
 * 2. Add your API key to app.json under `expo.android.googleMapsApiKey`
 *    and `expo.ios.googleMapsApiKey`
 * 3. Implement `findNearby` using the SDK's nearbySearch with
 *    type: 'liquor_store', openNow: true
 * 4. In `useNearestStore.ts`, swap `new OverpassProvider()` for
 *    `new GoogleMapsProvider()`
 *
 * The StoreProvider interface ensures a drop-in replacement.
 */

import { Coords } from '../utils/geo';
import { Store, StoreProvider } from './types';

export class GoogleMapsProvider implements StoreProvider {
  async findNearby(_center: Coords, _radiusMeters: number): Promise<Store[]> {
    throw new Error(
      'GoogleMapsProvider is not yet implemented. See comments in this file.'
    );
  }
}
