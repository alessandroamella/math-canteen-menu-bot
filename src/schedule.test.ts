import { expect, test } from "bun:test";
import { msUntilNext } from "./schedule";
import { restOfWeek, weekdayIndex, type DayMenu } from "./matkant";

const HOUR = 3_600_000;

test("next run later the same day", () => {
  // 2026-08-24 06:00 UTC = 08:00 in Copenhagen (CEST, UTC+2)
  const now = new Date("2026-08-24T06:00:00Z");
  expect(msUntilNext(9, 0, "Europe/Copenhagen", now)).toBe(1 * HOUR);
});

test("time already passed: moves to tomorrow", () => {
  const now = new Date("2026-08-24T08:00:00Z"); // 10:00 local time
  expect(msUntilNext(9, 0, "Europe/Copenhagen", now)).toBe(23 * HOUR);
});

test("end of DST: local time stays 09:00", () => {
  // In Denmark DST ends on 2026-10-25 at 03:00 → UTC+1.
  const now = new Date("2026-10-25T12:00:00Z"); // 13:00 local time, DST already ended
  const delay = msUntilNext(9, 0, "Europe/Copenhagen", now);
  const fireAt = new Date(now.getTime() + delay);
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fireAt);
  expect(local).toBe("09:00");
});

function day(header: string): DayMenu {
  return {
    header,
    menu: [],
    open: 1,
    has_menu: 0,
    opens_at: null,
    closes_at: null,
    note: "",
    closed_text: "",
    no_menu_text: "",
    weight_price: "",
    weight_price_text: "",
  };
}

test("weekdayIndex reads the Danish weekday", () => {
  expect(weekdayIndex(day("Mandag den 24. august"))).toBe(0);
  expect(weekdayIndex(day("Søndag den 30. august"))).toBe(6);
});

test("restOfWeek stops at the following Monday", () => {
  const days = [
    "Onsdag den 26. august",
    "Torsdag den 27. august",
    "Fredag den 28. august",
    "Lørdag den 29. august",
    "Søndag den 30. august",
    "Mandag den 31. august",
    "Tirsdag den 1. september",
  ].map(day);
  expect(restOfWeek(days).map((d) => d.header)).toEqual([
    "Onsdag den 26. august",
    "Torsdag den 27. august",
    "Fredag den 28. august",
    "Lørdag den 29. august",
    "Søndag den 30. august",
  ]);
});
