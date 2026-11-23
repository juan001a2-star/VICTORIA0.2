
const TIME_ZONE = "America/New_York";

type LotterySchedule = {
  open?: string;
  close?: string;
};

type Lottery = {
  id: number;
  name: string;
  drawTime?: string | null;
  closeTime?: string | null;
  schedule?: string | null;
  active?: boolean | null;
};

type DueLottery = {
  lotteryId: number;
  lotteryName: string;
  minutesSinceClose: number;
  drawDate: string;
};

const DAYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

function getNewYorkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function dateKey(year: number, month: number, day: number) {
  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function shiftDate(
  year: number,
  month: number,
  day: number,
  offset: number
) {
  const date = new Date(Date.UTC(year, month - 1, day + offset));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function newYorkWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  time: string
): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;

  for (let i = 0; i < 4; i++) {
    const parts = getNewYorkParts(new Date(guess));

    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );

    const difference = target - represented;

    if (difference === 0) break;

    guess += difference;
  }

  return new Date(guess);
}

function readSchedule(
  schedule: string | null | undefined
): Record<string, LotterySchedule> {
  if (!schedule) return {};

  try {
    const parsed = JSON.parse(schedule);

    if (!parsed || typeof parsed !== "object") return {};

    return parsed as Record<string, LotterySchedule>;
  } catch {
    return {};
  }
}

export function lotteriesDueForResults(
  lotteries: Lottery[],
  delayMinutes = 10,
  windowHours = 6,
  now = new Date()
): DueLottery[] {
  const current = getNewYorkParts(now);
  const results: DueLottery[] = [];

  for (const lottery of lotteries) {
    if (lottery.active === false) continue;

    const schedule = readSchedule(lottery.schedule);

    let latestDue: DueLottery | null = null;

    // Check today and yesterday so results shortly after midnight
    // can still be associated with the correct drawing date.
    for (const offset of [0, -1]) {
      const date = shiftDate(
        current.year,
        current.month,
        current.day,
        offset
      );

      const key = dateKey(date.year, date.month, date.day);
      const weekday = new Date(
        Date.UTC(date.year, date.month - 1, date.day)
      ).getUTCDay();

      const dayName = DAYS[weekday];
      const daySchedule = schedule[dayName];

      const closeTime =
        daySchedule?.close ||
        lottery.closeTime ||
        lottery.drawTime ||
        "20:00";

      const closeDate = newYorkWallTimeToUtc(
        date.year,
        date.month,
        date.day,
        closeTime
      );

      if (!closeDate) continue;

      const elapsed = now.getTime() - closeDate.getTime();
      const minutesSinceClose = Math.floor(elapsed / 60000);

      if (minutesSinceClose < delayMinutes) continue;
      if (minutesSinceClose > windowHours * 60) continue;

      const candidate: DueLottery = {
        lotteryId: lottery.id,
        lotteryName: lottery.name,
        minutesSinceClose,
        drawDate: key,
      };

      if (
        !latestDue ||
        candidate.minutesSinceClose < latestDue.minutesSinceClose
      ) {
        latestDue = candidate;
      }
    }

    if (latestDue) {
      results.push(latestDue);
    }
  }

  return results;
}
