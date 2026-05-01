/**
 * Minimal OSM `opening_hours` parser.
 *
 * Handles the most common formats found in practice:
 *   - "24/7"
 *   - "Mo-Fr 09:00-21:00"
 *   - "Mo-Fr 09:00-21:00; Sa 10:00-20:00; Su closed"
 *   - "Mo-Su 10:00-22:00"
 *   - "09:00-22:00"  (applies every day)
 *
 * Returns:
 *   "open"    — currently within an open window
 *   "closed"  — currently outside all open windows
 *   "unknown" — format not recognised
 */

export type OpenStatus = 'open' | 'closed' | 'unknown';

const DAY_NAMES: Record<string, number> = {
  Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0,
};

function parseTime(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

function expandDayRange(range: string): number[] {
  if (range.includes('-')) {
    const [start, end] = range.split('-');
    const s = DAY_NAMES[start];
    const e = DAY_NAMES[end];
    if (s === undefined || e === undefined) return [];
    const days: number[] = [];
    // Handle wrap-around (e.g. Fr-Mo)
    let cur = s;
    while (true) {
      days.push(cur);
      if (cur === e) break;
      cur = (cur + 1) % 7;
      // Safety valve to avoid infinite loops on bad data
      if (days.length > 7) break;
    }
    return days;
  }
  const d = DAY_NAMES[range];
  return d !== undefined ? [d] : [];
}

export function isOpenNow(openingHoursTag: string): OpenStatus {
  if (!openingHoursTag || openingHoursTag.trim() === '') return 'unknown';

  const tag = openingHoursTag.trim();

  if (tag === '24/7') return 'open';

  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Split on semicolons to get individual rules
  const rules = tag.split(';').map((r) => r.trim()).filter(Boolean);

  for (const rule of rules) {
    // "closed" keyword
    if (/\bclosed\b/i.test(rule)) continue;

    // Try to parse "DaySpec TimeRange" or just "TimeRange"
    // Day spec examples: "Mo-Fr", "Sa", "Mo,We,Fr", "Mo-Su"
    const match = rule.match(
      /^([A-Za-z,\-]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/
    );

    if (match) {
      const [, daySpec, openStr, closeStr] = match;
      const open = parseTime(openStr);
      const close = parseTime(closeStr);

      // Expand comma-separated or range day specs
      let days: number[] = [];
      for (const part of daySpec.split(',')) {
        days = days.concat(expandDayRange(part.trim()));
      }

      if (!days.includes(currentDay)) continue;

      if (close <= open) {
        // Crosses midnight — open if after opening OR before closing
        if (currentMinutes >= open || currentMinutes < close) return 'open';
      } else {
        if (currentMinutes >= open && currentMinutes < close) return 'open';
      }
      // Matched the day but outside hours — still "closed" unless another rule opens
      continue;
    }

    // No day spec — try just "HH:MM-HH:MM" applying to all days
    const timeOnly = rule.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (timeOnly) {
      const open = parseTime(timeOnly[1]);
      const close = parseTime(timeOnly[2]);
      if (close <= open) {
        if (currentMinutes >= open || currentMinutes < close) return 'open';
      } else {
        if (currentMinutes >= open && currentMinutes < close) return 'open';
      }
      continue;
    }

    // Unrecognised format
    return 'unknown';
  }

  return 'closed';
}
