/**
 * Client for the Matematisk Kantine (matkant.dk) menu data.
 *
 * The page https://www.matkant.dk/menu/dag/ is client-side rendered by
 * design/js/m.js, which reads JSON from /data/m/d (lunch) and /data/m/e
 * (evening). We hit those endpoints directly: no HTML parsing.
 */

const BASE = "https://www.matkant.dk/data/m/";

export type Category = "meat" | "veg" | "other" | (string & {});

export interface Dish {
  id: number;
  name: string;
  /** Allergens / ingredients, in Danish. Can be an empty string. */
  contains_da: string;
  contains_en: string;
  category: Category;
  ui_class: string;
  /** Surcharge in DKK, as a string. Empty if included in the weight price. */
  price: string;
}

/** One day of the lunch menu (endpoint /data/m/d). */
export interface DayMenu {
  /** E.g. "Mandag den 24. august" */
  header: string;
  menu: Dish[];
  open: 0 | 1;
  has_menu: 0 | 1;
  opens_at: string | null;
  closes_at: string | null;
  note: string;
  closed_text: string;
  no_menu_text: string;
  weight_price: string;
  weight_price_text: string;
}

export interface EveningDay {
  day: string;
  open: 0 | 1;
  status: string;
}

/** One week of the evening menu (endpoint /data/m/e). */
export interface EveningMenu {
  /** E.g. "Uge 35, 2026" */
  header: string;
  /** E.g. "24.08.2026 til 28.08.2026" */
  subheader: string;
  menu: Dish[];
  open_week: EveningDay[];
  has_open: 1 | "";
  has_menu: 1 | "";
  note?: string;
  closed_text: string;
  no_menu_text: string;
  weight_price: string;
  weight_price_text: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: {
      accept: "application/json",
      "user-agent": "matkant-telegram-bot (personal use)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`matkant.dk responded ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Lunch menu: today + the following days (the API returns ~8). */
export function fetchDayMenu(): Promise<DayMenu[]> {
  return getJson<DayMenu[]>("d");
}

/** Evening menu/opening hours, week by week. */
export function fetchEveningMenu(): Promise<EveningMenu[]> {
  return getJson<EveningMenu[]>("e");
}

const WEEKDAYS_DA = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

/** 0-6 index (Monday-Sunday) derived from the day's Danish header. */
export function weekdayIndex(day: DayMenu): number {
  const name = day.header.split(" ")[0]?.toLowerCase() ?? "";
  return WEEKDAYS_DA.findIndex((d) => d.toLowerCase() === name);
}

/**
 * From today up to and including Sunday: the API returns more days than
 * needed, so we cut as soon as the day index "wraps back around".
 */
export function restOfWeek(days: DayMenu[]): DayMenu[] {
  const out: DayMenu[] = [];
  let prev = -1;
  for (const day of days) {
    const idx = weekdayIndex(day);
    if (idx >= 0 && idx <= prev) break;
    prev = idx;
    out.push(day);
  }
  return out;
}
