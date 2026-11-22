const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** Today's calendar date where the user is. `toISOString` would give the UTC day. */
export function localToday(now: Date = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

// Calendar dates are formatted in UTC on both sides, so no timezone can shift the day.
function format(value: string, options: Intl.DateTimeFormatOptions, locale?: string): string {
  const match = DATE_PATTERN.exec(value);
  if (!match || !isCalendarDate(value)) return value;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
}

export const formatCalendarDate = (value: string, locale?: string) =>
  format(value, { day: 'numeric', month: 'long', year: 'numeric' }, locale);

export const formatWeekday = (value: string, locale?: string) =>
  format(value, { weekday: 'long' }, locale);

export const formatMonth = (value: string, locale?: string) =>
  format(`${value.slice(0, 7)}-01`, { month: 'long', year: 'numeric' }, locale);

export const formatDayNumber = (value: string) => String(Number(value.slice(8, 10)));
