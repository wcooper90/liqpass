import { describe, it, expect, vi } from 'vitest';

// Mocked before geo.ts loads so navigator.languages is never accessed.
vi.mock('./units', () => ({ useImperial: false }));

import {
  haversineDistance,
  bearing,
  shortestArc,
  formatDistance,
  formatRadius,
  formatWalkingTime,
} from './geo';

describe('haversineDistance', () => {
  it('returns 0 for identical coords', () => {
    expect(haversineDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });

  it('measures ~111 km for 1° latitude at the equator', () => {
    const d = haversineDistance({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    const a = { lat: 51.5074, lon: -0.1278 };
    const b = { lat: 48.8566, lon: 2.3522 };
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 0);
  });
});

describe('bearing', () => {
  it('returns ~0° for due north', () => {
    expect(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 0);
  });

  it('returns ~90° for due east', () => {
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 0);
  });

  it('returns ~180° for due south', () => {
    expect(bearing({ lat: 1, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(180, 0);
  });

  it('returns ~270° for due west', () => {
    expect(bearing({ lat: 0, lon: 1 }, { lat: 0, lon: 0 })).toBeCloseTo(270, 0);
  });
});

describe('shortestArc', () => {
  it('takes the +20° short arc when crossing 360→0', () => {
    // current=350, target=10 → should step +20 to 370, not -340
    expect(shortestArc(350, 10)).toBeCloseTo(370, 5);
  });

  it('takes the −20° short arc when crossing 0→360', () => {
    // current=10, target=350 → should step −20 to −10, not +340
    expect(shortestArc(10, 350)).toBeCloseTo(-10, 5);
  });

  it('returns the same value for identical angles', () => {
    expect(shortestArc(45, 45)).toBeCloseTo(45, 5);
  });

  it('accumulates correctly over multiple calls', () => {
    // Simulate the compass updating across the 0/360 boundary
    let acc = shortestArc(0, 350);
    acc = shortestArc(acc, 340);
    // Should land around −20, not +340
    expect(acc).toBeLessThan(0);
  });
});

describe('formatWalkingTime', () => {
  it('floors to 1 min minimum', () => {
    expect(formatWalkingTime(10)).toBe('1 min walk');
  });

  it('formats minutes for short distances', () => {
    expect(formatWalkingTime(400)).toBe('5 min walk'); // 400 / 80 = 5
  });

  it('formats whole hours', () => {
    expect(formatWalkingTime(4_800)).toBe('1 hr walk'); // 4800 / 80 = 60
  });

  it('formats hours + minutes', () => {
    expect(formatWalkingTime(6_000)).toBe('1 hr 15 min walk'); // 6000 / 80 = 75
  });
});

describe('formatDistance (metric)', () => {
  it('shows metres below 1 km', () => {
    expect(formatDistance(500)).toBe('500 m');
  });

  it('shows one decimal km at 1.5 km', () => {
    expect(formatDistance(1_500)).toBe('1.5 km');
  });

  it('shows one decimal km at 9.9 km', () => {
    expect(formatDistance(9_900)).toBe('9.9 km');
  });
});

describe('formatRadius (metric)', () => {
  it('rounds 5000 m to 5 km', () => {
    expect(formatRadius(5_000)).toBe('5 km');
  });

  it('rounds 15000 m to 15 km', () => {
    expect(formatRadius(15_000)).toBe('15 km');
  });
});
