/**
 * Formattazione dei menù in messaggi Telegram (parse_mode: HTML).
 *
 * Le date e gli allergeni più comuni sono tradotti da tabelle locali
 * (deterministico e gratis); i nomi dei piatti e i testi liberi passano invece
 * per l'API di traduzione, che qui arriva già risolta in una `Translations`.
 */

import type { DayMenu, Dish, EveningMenu } from "./matkant";
import type { Translations } from "./translate";

/** Mostra l'originale danese accanto alla traduzione (utile davanti al bancone). */
const SHOW_ORIGINAL = process.env.SHOW_ORIGINAL !== "false";

const CATEGORY_EMOJI: Record<string, string> = {
  meat: "🍖",
  veg: "🥗",
  fish: "🐟",
  other: "🍚",
};

const WEEKDAYS_IT: Record<string, string> = {
  mandag: "Lunedì",
  tirsdag: "Martedì",
  onsdag: "Mercoledì",
  torsdag: "Giovedì",
  fredag: "Venerdì",
  lørdag: "Sabato",
  søndag: "Domenica",
};

const MONTHS_IT: Record<string, string> = {
  januar: "gennaio",
  februar: "febbraio",
  marts: "marzo",
  april: "aprile",
  maj: "maggio",
  juni: "giugno",
  juli: "luglio",
  august: "agosto",
  september: "settembre",
  oktober: "ottobre",
  november: "novembre",
  december: "dicembre",
};

/** Allergeni/ingredienti ricorrenti, tradotti dal danese. */
const ALLERGENS_IT: Record<string, string> = {
  gluten: "glutine",
  mælk: "latte",
  æg: "uova",
  soja: "soia",
  jordnødder: "arachidi",
  nødder: "frutta a guscio",
  sesam: "sesamo",
  sennep: "senape",
  selleri: "sedano",
  fisk: "pesce",
  skaldyr: "crostacei",
  bløddyr: "molluschi",
  svovldioxid: "solfiti",
  sulfitter: "solfiti",
  lupin: "lupini",
  oksekød: "manzo",
  okse: "manzo",
  grisekød: "maiale",
  gris: "maiale",
  kylling: "pollo",
  lam: "agnello",
  and: "anatra",
  kalkun: "tacchino",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Date e intestazioni, tradotte localmente:
 *   "Mandag den 24. august"      → "Lunedì 24 agosto"
 *   "Uge 35, 2026"               → "Settimana 35, 2026"
 *   "24.08.2026 til 28.08.2026"  → "24.08.2026 – 28.08.2026"
 */
export function localizeHeader(header: string): string {
  const day = /^(\p{L}+)\s+den\s+(\d+)\.\s+(\p{L}+)$/u.exec(header);
  if (day) {
    const [, weekday = "", date = "", month = ""] = day;
    const it = WEEKDAYS_IT[weekday.toLowerCase()];
    const monthIt = MONTHS_IT[month.toLowerCase()] ?? month;
    if (it) return `${it} ${date} ${monthIt}`;
  }

  return header
    .replace(/^Uge\b/i, "Settimana")
    .replace(/\btil\b/gi, "–")
    .replace(/\p{L}+/gu, (w) => WEEKDAYS_IT[w.toLowerCase()] ?? w);
}

/** Pezzi di `contains_da` che le tabelle locali non coprono. */
function unknownAllergens(contains: string): string[] {
  return splitAllergens(contains)
    .filter((p) => !ALLERGENS_IT[p.term.toLowerCase()])
    .map((p) => p.term);
}

function splitAllergens(contains: string): { traces: boolean; term: string }[] {
  return contains
    .split(",")
    .map((raw) => {
      let term = raw.trim();
      const traces = /^spor af\s+/i.exec(term);
      if (traces) term = term.slice(traces[0].length);
      return { traces: Boolean(traces), term };
    })
    .filter((p) => p.term.length > 0);
}

/** "Kylling, Spor af skaldyr" → "pollo, tracce di crostacei" */
function formatAllergens(contains: string, tr: Translations): string {
  return splitAllergens(contains)
    .map(({ traces, term }) => {
      const it =
        ALLERGENS_IT[term.toLowerCase()] ?? tr.get(term)?.toLowerCase() ?? term.toLowerCase();
      return (traces ? "tracce di " : "") + it;
    })
    .join(", ");
}

/** Traduzione se disponibile e diversa dall'originale, altrimenti il danese. */
function localize(text: string, tr: Translations): string {
  const it = tr.get(text.trim());
  return it && it.toLowerCase() !== text.trim().toLowerCase() ? it : text;
}

/** Come `localize`, ma tiene anche l'originale danese tra parentesi. */
function localizeWithOriginal(text: string, tr: Translations): string {
  const it = localize(text, tr);
  if (!SHOW_ORIGINAL || it === text) return escapeHtml(it);
  return `${escapeHtml(it)} <i>(${escapeHtml(text)})</i>`;
}

function formatDish(dish: Dish, tr: Translations): string {
  const emoji = CATEGORY_EMOJI[dish.category] ?? "•";
  let line = `${emoji} ${localizeWithOriginal(dish.name, tr)}`;
  if (dish.price) line += ` <i>(+${escapeHtml(dish.price)} kr.)</i>`;
  if (dish.contains_da) {
    line += `\n   <i>contiene: ${escapeHtml(formatAllergens(dish.contains_da, tr))}</i>`;
  }
  return line;
}

/** Un giorno di pranzo. `heading` sovrascrive il titolo (es. "Oggi"). */
export function formatDay(
  day: DayMenu,
  tr: Translations,
  heading?: string,
): string {
  const date = escapeHtml(localizeHeader(day.header));
  const lines = [
    heading ? `<b>${escapeHtml(heading)}</b> — ${date}` : `<b>${date}</b>`,
  ];

  if (day.note) lines.push(`<i>${escapeHtml(localize(day.note, tr))}</i>`);

  if (!day.open) {
    lines.push(`🔒 ${escapeHtml(localize(day.closed_text || "Chiuso.", tr))}`);
    return lines.join("\n");
  }
  if (!day.has_menu || day.menu.length === 0) {
    lines.push(
      `🤷 ${escapeHtml(localize(day.no_menu_text || "Nessun menù disponibile.", tr))}`,
    );
    return lines.join("\n");
  }

  lines.push(...day.menu.map((d) => formatDish(d, tr)));
  if (day.opens_at && day.closes_at) {
    lines.push(`🕗 ${day.opens_at}–${day.closes_at}`);
  }
  if (day.weight_price) {
    lines.push(`💰 ${day.weight_price} kr. / 100g (buffet caldo e insalate)`);
  }
  return lines.join("\n");
}

/** Messaggio giornaliero: oggi in evidenza + anteprima del resto della settimana. */
export function formatDaily(days: DayMenu[], tr: Translations): string {
  if (days.length === 0) return "Nessun dato disponibile da matkant.dk.";

  const [today, ...upcoming] = days as [DayMenu, ...DayMenu[]];
  const blocks = [
    `🍽 <b>Matematisk Kantine</b>\n\n${formatDay(today, tr, "Oggi")}`,
  ];

  if (upcoming.length > 0) {
    const rest = upcoming.map((day) => {
      const head = `<b>${escapeHtml(localizeHeader(day.header))}</b>`;
      if (!day.open) {
        return `${head}\n🔒 ${escapeHtml(localize(day.closed_text || "Chiuso.", tr))}`;
      }
      if (!day.has_menu || day.menu.length === 0) {
        return `${head}\n🤷 ${escapeHtml(localize(day.no_menu_text || "Nessun menù disponibile.", tr))}`;
      }
      const dishes = day.menu
        .map(
          (d) =>
            `${CATEGORY_EMOJI[d.category] ?? "•"} ${localizeWithOriginal(d.name, tr)}`,
        )
        .join("\n");
      return `${head}\n${dishes}`;
    });
    blocks.push(`📅 <b>Prossimi giorni</b>\n\n${rest.join("\n\n")}`);
  }

  return blocks.join("\n\n———\n\n");
}

/** Settimana intera, con tutti i dettagli. */
export function formatWeek(days: DayMenu[], tr: Translations): string {
  if (days.length === 0) return "Nessun dato disponibile da matkant.dk.";
  return (
    "🍽 <b>Matematisk Kantine — menù della settimana</b>\n\n" +
    days.map((d) => formatDay(d, tr)).join("\n\n")
  );
}

/** Menù/apertura serale (una o più settimane). */
export function formatEvening(weeks: EveningMenu[], tr: Translations): string {
  if (weeks.length === 0) return "Nessun dato disponibile da matkant.dk.";

  const blocks = weeks.map((week) => {
    const lines = [
      `<b>${escapeHtml(localizeHeader(week.header))}</b> <i>(${escapeHtml(localizeHeader(week.subheader))})</i>`,
    ];
    if (week.note) lines.push(`<i>${escapeHtml(localize(week.note, tr))}</i>`);

    if (!week.has_open) {
      lines.push(
        `🔒 ${escapeHtml(localize(week.closed_text || "Chiuso di sera.", tr))}`,
      );
      return lines.join("\n");
    }

    lines.push(
      week.open_week
        .map(
          (d) =>
            `${d.open ? "✅" : "🔒"} ${escapeHtml(localizeHeader(d.day))}: ` +
            escapeHtml(d.open ? "aperto" : "chiuso"),
        )
        .join("\n"),
    );

    if (week.has_menu && week.menu.length > 0) {
      lines.push(...week.menu.map((d) => formatDish(d, tr)));
      if (week.weight_price) lines.push(`💰 ${week.weight_price} kr. / 100g`);
    } else {
      lines.push(
        `🤷 ${escapeHtml(localize(week.no_menu_text || "Menù non ancora pubblicato.", tr))}`,
      );
    }
    return lines.join("\n");
  });

  return (
    "🌙 <b>Matematisk Kantine — buffet serale (17:00–20:00)</b>\n\n" +
    blocks.join("\n\n———\n\n")
  );
}

/** Tutte le stringhe di un menù di pranzo che vanno passate al traduttore. */
export function textsToTranslate(days: DayMenu[]): string[] {
  const texts: string[] = [];
  for (const day of days) {
    texts.push(day.note, day.closed_text, day.no_menu_text);
    for (const dish of day.menu) {
      texts.push(dish.name, ...unknownAllergens(dish.contains_da));
    }
  }
  return texts.filter(Boolean);
}

/** Idem, per il menù serale. */
export function textsToTranslateEvening(weeks: EveningMenu[]): string[] {
  const texts: string[] = [];
  for (const week of weeks) {
    texts.push(week.note ?? "", week.closed_text, week.no_menu_text);
    for (const dish of week.menu) {
      texts.push(dish.name, ...unknownAllergens(dish.contains_da));
    }
  }
  return texts.filter(Boolean);
}
