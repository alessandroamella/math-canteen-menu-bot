import { expect, test } from "bun:test";
import { msUntilNext } from "./schedule";
import { restOfWeek, weekdayIndex, type DayMenu } from "./matkant";

const HOUR = 3_600_000;

test("prossimo invio più tardi nello stesso giorno", () => {
  // 2026-08-24 06:00 UTC = 08:00 a Copenaghen (CEST, UTC+2)
  const now = new Date("2026-08-24T06:00:00Z");
  expect(msUntilNext(9, 0, "Europe/Copenhagen", now)).toBe(1 * HOUR);
});

test("orario già passato: si sposta a domani", () => {
  const now = new Date("2026-08-24T08:00:00Z"); // 10:00 locali
  expect(msUntilNext(9, 0, "Europe/Copenhagen", now)).toBe(23 * HOUR);
});

test("fine dell'ora legale: l'orario locale resta 09:00", () => {
  // In Danimarca il DST finisce il 25/10/2026 alle 03:00 → UTC+1.
  const now = new Date("2026-10-25T12:00:00Z"); // 13:00 locali, DST già finito
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

test("weekdayIndex legge il giorno danese", () => {
  expect(weekdayIndex(day("Mandag den 24. august"))).toBe(0);
  expect(weekdayIndex(day("Søndag den 30. august"))).toBe(6);
});

test("restOfWeek si ferma al lunedì successivo", () => {
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
