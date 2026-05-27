# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Liqpass is a mobile-first compass app that points users toward the nearest liquor store. It uses the Overpass API (OpenStreetMap) to find nearby stores, the device compass (`DeviceOrientationEvent`) to determine heading, and Capacitor to package as an Android APK.

## Commands

```bash
npm run dev          # start Vite dev server (exposed on LAN for phone testing)
npm run build        # tsc + vite build → dist/
npm test             # run all tests once (Vitest)
npm run test:watch   # rerun tests on file changes
npm run cap:sync     # build + npx cap sync android (copies dist/ into the Android project)
npm run cap:open     # open the Android project in Android Studio
npm run android      # cap:sync then cap:open (full deploy pipeline)
```

There is no lint config.

## Tests

Tests use [Vitest](https://vitest.dev/) and live co-located with source files (`*.test.ts`). Run `npm test` before committing. When adding a new feature, add or update the relevant test file.

- `src/utils/geo.test.ts` — unit tests for haversine distance, bearing, `shortestArc`, and distance/time formatters
- `src/utils/openingHours.test.ts` — OSM `opening_hours` parser edge cases; uses `vi.useFakeTimers()` to pin the clock
- `src/providers/OverpassProvider.test.ts` — integration tests with `fetch` mocked; covers sorting, fallback endpoints, address parsing, and closed-store filtering

The `units.ts` module reads `navigator.languages` at import time. Any test file that transitively imports it (via `geo.ts` or `OverpassProvider.ts`) must mock it first:

```ts
vi.mock('../utils/units', () => ({ useImperial: false }));
```

## Architecture

The app is a plain TypeScript + Vite SPA wrapped in Capacitor (no framework).

**Data flow:**
1. `main.ts` bootstraps `App`, `initTheme`, `initAbout` on DOMContentLoaded.
2. `App` (`app.ts`) owns all state and drives the UI. State machine: `idle → locating → fetching → found | no_stores | error`.
3. `geolocation.ts` — wraps Capacitor's native `Geolocation` plugin on device, falls back to browser `navigator.geolocation` in dev. Returns a `GeolocationWatcher`.
4. `OverpassProvider` (`providers/OverpassProvider.ts`) — queries two Overpass API endpoints for OSM nodes/ways tagged `shop=alcohol` or `shop=liquor_store` within a bounding box. Starts at 5 km radius, auto-expands to 15 km if no results. Skips confirmed-closed stores (OSM `opening_hours` parsed by `utils/openingHours.ts`). Sorted by haversine distance.
5. `CompassUI` (`compass.ts`) — animates an SVG compass rose and needle via CSS transforms. Uses `shortestArc` to avoid 360° spin artefacts.

**Provider interface:** `StoreProvider` in `providers/types.ts` defines `findNearby(center, radiusMeters)`. `GoogleMapsProvider` exists as a stub for a future drop-in swap.

**Capacitor config:** `capacitor.config.ts` — app ID `com.liqpass.app`, web dir `dist/`, Android background `#0a0a0a`.

**Vite server:** exposes on LAN (`host: true`) so a phone on the same network can test the web build. `allowedHosts` lists localtunnel hostnames for remote phone testing.

## iOS App Store — next steps (requires Mac)

The iOS Capacitor platform has not been scaffolded yet. Complete these steps in order:

**1. Scaffold the iOS project**
```bash
npm run build
npx cap add ios
npx cap sync ios
```

**2. Add required `Info.plist` usage descriptions**

Without these, Apple will reject the submission. Open the Xcode project (`npx cap open ios`) and add to `Info.plist`:

| Key | Suggested value |
|-----|-----------------|
| `NSLocationWhenInUseUsageDescription` | `Liqpass uses your location to find the nearest liquor store.` |
| `NSMotionUsageDescription` | `Liqpass uses your device's compass to point you toward the nearest store.` |

**3. Check the app icon**
Apple requires a 1024×1024 PNG with no transparency. Verify `assets/icon.png` meets this before submitting.

**4. Add iOS sync script to package.json**
```json
"cap:sync:ios": "npm run build && npx cap sync ios",
"cap:open:ios": "npx cap open ios"
```

**5. Update `CLAUDE.md`**
Once the `ios/` project directory exists, remove this section and update the Commands section with the iOS scripts.

---

## Key platform notes

- iOS: `DeviceOrientationEvent.requestPermission()` must be called from a user gesture (the Start button). Uses `webkitCompassHeading` (clockwise from North).
- Android: uses `deviceorientationabsolute` if available; converts CCW `alpha` to CW heading.
- Magnetometer calibration is detected via circular spread of heading history (240-sample window); a hint is shown when spread exceeds 0.15.
