/**
 * Client per i dati del menù della Matematisk Kantine (matkant.dk).
 *
 * La pagina https://www.matkant.dk/menu/dag/ è renderizzata lato client da
 * design/js/m.js, che legge il JSON da /data/m/d (pranzo) e /data/m/e (sera).
 * Usiamo direttamente quegli endpoint: niente parsing di HTML.
 */

const BASE = "https://www.matkant.dk/data/m/";

export type Category = "meat" | "veg" | "other" | (string & {});

export interface Dish {
  id: number;
  name: string;
  /** Allergeni / ingredienti, in danese. Può essere stringa vuota. */
  contains_da: string;
  contains_en: string;
  category: Category;
  ui_class: string;
  /** Supplemento in DKK, come stringa. Vuoto se incluso nel prezzo a peso. */
  price: string;
}

/** Un giorno del menù di pranzo (endpoint /data/m/d). */
export interface DayMenu {
  /** Es. "Mandag den 24. august" */
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

/** Una settimana del menù serale (endpoint /data/m/e). */
export interface EveningMenu {
  /** Es. "Uge 35, 2026" */
  header: string;
  /** Es. "24.08.2026 til 28.08.2026" */
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
    throw new Error(`matkant.dk ha risposto ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Menù di pranzo: oggi + i giorni successivi (l'API ne restituisce ~8). */
export function fetchDayMenu(): Promise<DayMenu[]> {
  return getJson<DayMenu[]>("d");
}

/** Menù/apertura serale, settimana per settimana. */
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

/** Indice 0-6 (lunedì-domenica) ricavato dall'header danese del giorno. */
export function weekdayIndex(day: DayMenu): number {
  const name = day.header.split(" ")[0]?.toLowerCase() ?? "";
  return WEEKDAYS_DA.findIndex((d) => d.toLowerCase() === name);
}

/**
 * Da oggi fino alla domenica inclusa: l'API restituisce più giorni del
 * necessario, quindi tagliamo appena l'indice del giorno "torna indietro".
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
