/**
 * Horarios de loterías: las estadounidenses usan hora del Este (DST automático).
 * Las demás usan hora de Guayana Francesa, que no cambia durante el año.
 */
export const US_EASTERN_TIME_ZONE = "America/New_York";
export const DEFAULT_TIME_ZONE = "America/Cayenne";

export function getLotteryTimeZone(lotteryName?: string | null): string {
  const name = (lotteryName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(florida|new\s*jersey|georgia|new\s*york)\b/.test(name)
    ? US_EASTERN_TIME_ZONE
    : DEFAULT_TIME_ZONE;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function getLotteryLocalClock(lotteryName?: string | null): { dayKey: typeof DAY_KEYS[number]; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getLotteryTimeZone(lotteryName),
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const weekdayMap: Record<string, typeof DAY_KEYS[number]> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return { dayKey: weekdayMap[map.weekday] || "sun", mins: hour * 60 + Number(map.minute) };
}
