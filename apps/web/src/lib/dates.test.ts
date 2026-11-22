import { describe, expect, it } from 'vitest';
import { formatCalendarDate, isCalendarDate, localToday } from './dates';

describe('localToday', () => {
  it('uses the local calendar day, not the UTC day', () => {
    // 23:30 local time on the 22nd, built from local parts in any test timezone.
    const lateEvening = new Date(2026, 10, 22, 23, 30);
    expect(localToday(lateEvening)).toBe('2026-11-22');
    const justAfterMidnight = new Date(2026, 10, 23, 0, 10);
    expect(localToday(justAfterMidnight)).toBe('2026-11-23');
  });

  it('pads months and days', () => {
    expect(localToday(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('formatCalendarDate', () => {
  // Run with TZ=Pacific/Kiritimati or TZ=Pacific/Pago_Pago to cover both extremes.
  it('shows the stored day whatever the timezone', () => {
    expect(formatCalendarDate('2026-03-01', 'en-GB')).toBe('1 March 2026');
  });

  it('leaves an unparseable value visible', () => {
    expect(formatCalendarDate('not-a-date')).toBe('not-a-date');
  });
});

describe('isCalendarDate', () => {
  it('accepts real dates, including a leap day', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-1', '', '2026-11-31'])('rejects %s', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});
