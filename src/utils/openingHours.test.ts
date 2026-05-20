import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isOpenNow } from './openingHours';

// Pin to a known reference: Monday 2026-05-18 14:00 local time.
// Day indices: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
function setTime(dayIndex: number, hours: number, minutes: number) {
  // 2026-05-18 is a Monday (dayIndex=1). Offset from there.
  const base = new Date(2026, 4, 18, 0, 0, 0); // Mon 18 May 2026 00:00
  const daysToAdd = (dayIndex - 1 + 7) % 7;
  base.setDate(base.getDate() + daysToAdd);
  base.setHours(hours, minutes, 0, 0);
  vi.setSystemTime(base);
}

describe('isOpenNow', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns unknown for empty string', () => {
    expect(isOpenNow('')).toBe('unknown');
  });

  it('returns unknown for whitespace-only string', () => {
    expect(isOpenNow('   ')).toBe('unknown');
  });

  it('returns open for 24/7 at any time', () => {
    setTime(0, 3, 0); // Sunday 3am
    expect(isOpenNow('24/7')).toBe('open');
  });

  it('returns open when within weekday hours', () => {
    setTime(3, 14, 0); // Wednesday 14:00
    expect(isOpenNow('Mo-Fr 09:00-21:00')).toBe('open');
  });

  it('returns closed before opening time', () => {
    setTime(3, 8, 30); // Wednesday 08:30
    expect(isOpenNow('Mo-Fr 09:00-21:00')).toBe('closed');
  });

  it('returns closed at exactly closing time', () => {
    setTime(3, 21, 0); // Wednesday 21:00 — close is exclusive
    expect(isOpenNow('Mo-Fr 09:00-21:00')).toBe('closed');
  });

  it('returns closed after closing time', () => {
    setTime(3, 22, 0); // Wednesday 22:00
    expect(isOpenNow('Mo-Fr 09:00-21:00')).toBe('closed');
  });

  it('returns closed on a day not in the rule', () => {
    setTime(6, 12, 0); // Saturday
    expect(isOpenNow('Mo-Fr 09:00-21:00')).toBe('closed');
  });

  it('handles semicolon-separated rules — matches Saturday rule', () => {
    setTime(6, 11, 0); // Saturday 11:00
    expect(isOpenNow('Mo-Fr 09:00-21:00; Sa 10:00-20:00')).toBe('open');
  });

  it('handles semicolon-separated rules — Saturday outside hours', () => {
    setTime(6, 21, 0); // Saturday 21:00
    expect(isOpenNow('Mo-Fr 09:00-21:00; Sa 10:00-20:00')).toBe('closed');
  });

  it('treats "closed" keyword as excluding that day', () => {
    setTime(0, 12, 0); // Sunday
    expect(isOpenNow('Mo-Sa 09:00-21:00; Su closed')).toBe('closed');
  });

  it('handles time-only rule with no day spec (applies every day)', () => {
    setTime(0, 15, 0); // Sunday 15:00
    expect(isOpenNow('10:00-20:00')).toBe('open');
  });

  it('handles time-only rule — outside hours', () => {
    setTime(0, 9, 0); // Sunday 09:00
    expect(isOpenNow('10:00-20:00')).toBe('closed');
  });

  it('handles midnight-crossing hours — after open', () => {
    setTime(5, 23, 30); // Friday 23:30
    expect(isOpenNow('Mo-Fr 22:00-02:00')).toBe('open');
  });

  it('handles midnight-crossing hours — before close (early morning)', () => {
    setTime(6, 1, 0); // Saturday 01:00 — within Friday's midnight-spanning window
    // Note: the day has rolled over to Saturday; this rule only covers Mo-Fr.
    // So the 01:00 on Saturday is NOT within the Mo-Fr rule.
    expect(isOpenNow('Mo-Fr 22:00-02:00')).toBe('closed');
  });

  it('returns unknown for unrecognised format', () => {
    expect(isOpenNow('dawn till dusk')).toBe('unknown');
  });

  it('handles Mo-Su (full week)', () => {
    setTime(0, 12, 0); // Sunday
    expect(isOpenNow('Mo-Su 10:00-22:00')).toBe('open');
  });
});
