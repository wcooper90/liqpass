# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Liqpass is a mobile-first compass app that points users toward the nearest liquor store. It uses the Overpass API (OpenStreetMap) to find nearby stores, the device compass (`DeviceOrientationEvent`) to determine heading, and Capacitor to package as an Android APK.

## Commands

```bash
npm run dev          # start Vite dev server (exposed on LAN for phone testing)
npm run build        # tsc + vite build → dist/
npm run cap:sync     # build + npx cap sync android (copies dist/ into the Android project)
npm run cap:open     # open the Android project in Android Studio
npm run android      # cap:sync then cap:open (full deploy pipeline)
```

No test suite exists. There is no lint config.

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

## Key platform notes

- iOS: `DeviceOrientationEvent.requestPermission()` must be called from a user gesture (the Start button). Uses `webkitCompassHeading` (clockwise from North).
- Android: uses `deviceorientationabsolute` if available; converts CCW `alpha` to CW heading.
- Magnetometer calibration is detected via circular spread of heading history (240-sample window); a hint is shown when spread exceeds 0.15.
