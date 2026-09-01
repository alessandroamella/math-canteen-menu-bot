/**
 * Formattazione dei menù in messaggi Telegram (parse_mode: HTML), in una
 * delle lingue supportate.
 *
 * Le date e gli allergeni più comuni sono tradotti da tabelle locali
 * (deterministico e gratis, vedi `locale.ts`); i nomi dei piatti e i testi
 * liberi passano invece per l'API di traduzione, che qui arriva già risolta
 * in una `Translations`.
 */

import type { Language } from "./locale";
import { locale } from "./locale";
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Date e intestazioni, tradotte localmente:
 *   "Mandag den 24. august"      → "Lunedì 24 agosto" (it)
 *   "Uge 35, 2026"               → "Settimana 35, 2026" (it)
 *   "24.08.2026 til 28.08.2026"  → "24.08.2026 – 28.08.2026"
 */
export function localizeHeader(header: string, lang: Language = "it"): string {
  const loc = locale(lang);
  const day = /^(\p{L}+)\s+den\s+(\d+)\.\s+(\p{L}+)$/u.exec(header);
  if (day) {
    const [, weekday = "", date = "", month = ""] = day;
    const w = loc.weekdays[weekday.toLowerCase()];
    const m = loc.months[month.toLowerCase()] ?? month;
    if (w) return `${w} ${date} ${m}`;
  }

  return header
    .replace(/^Uge\b/i, loc.ui.weekWord)
    .replace(loc.ui.tilWord, "–")
    .replace(/\p{L}+/gu, (w) => loc.weekdays[w.toLowerCase()] ?? w);
}

/** Pezzi di `contains_da` che le tabelle locali non coprono. */
function unknownAllergens(contains: string, lang: Language): string[] {
  const loc = locale(lang);
  return splitAllergens(contains)
    .filter((p) => !loc.allergens[p.term.toLowerCase()])
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
function formatAllergens(contains: string, tr: Translations, lang: Language): string {
  const loc = locale(lang);
  return splitAllergens(contains)
    .map(({ traces, term }) => {
      const localized =
        loc.allergens[term.toLowerCase()] ?? tr.get(term)?.toLowerCase() ?? term.toLowerCase();
      return (traces ? loc.ui.traces : "") + localized;
    })
    .join(", ");
}

/** Traduzione se disponibile e diversa dall'originale, altrimenti il danese. */
function localize(text: string, tr: Translations): string {
  const t = tr.get(text.trim());
  return t && t.toLowerCase() !== text.trim().toLowerCase() ? t : text;
}

/** Come `localize`, ma tiene anche l'originale danese tra parentesi. */
function localizeWithOriginal(text: string, tr: Translations, lang: Language): string {
  const t = localize(text, tr);
  if (lang === "da" || !SHOW_ORIGINAL || t === text) return escapeHtml(t);
  return `${escapeHtml(t)} <i>(${escapeHtml(text)})</i>`;
}

function formatDish(dish: Dish, tr: Translations, lang: Language): string {
  const emoji = CATEGORY_EMOJI[dish.category] ?? "•";
  let line = `${emoji} ${localizeWithOriginal(dish.name, tr, lang)}`;
  if (dish.price) line += ` <i>(+${escapeHtml(dish.price)} kr.)</i>`;
  if (dish.contains_da) {
    const loc = locale(lang);
    line += `\n   <i>${loc.ui.contains}: ${escapeHtml(formatAllergens(dish.contains_da, tr, lang))}</i>`;
  }
  return line;
}

/** Un giorno di pranzo. `heading` sovrascrive il titolo (es. "Oggi"). */
export function formatDay(
  day: DayMenu,
  tr: Translations,
  heading?: string,
  lang: Language = "it",
): string {
  const loc = locale(lang);
  const date = escapeHtml(localizeHeader(day.header, lang));
  const lines = [
    heading ? `<b>${escapeHtml(heading)}</b> — ${date}` : `<b>${date}</b>`,
  ];

  if (day.note) lines.push(`<i>${escapeHtml(localize(day.note, tr))}</i>`);

  if (!day.open) {
    lines.push(`🔒 ${escapeHtml(localize(day.closed_text || loc.ui.closed, tr))}`);
    return lines.join("\n");
  }
  if (!day.has_menu || day.menu.length === 0) {
    lines.push(
      `🤷 ${escapeHtml(localize(day.no_menu_text || loc.ui.noMenu, tr))}`,
    );
    return lines.join("\n");
  }

  lines.push(...day.menu.map((d) => formatDish(d, tr, lang)));
  if (day.opens_at && day.closes_at) {
    lines.push(`🕗 ${day.opens_at}–${day.closes_at}`);
  }
  if (day.weight_price) {
    lines.push(`💰 ${loc.ui.weightPrice(day.weight_price)}`);
  }
  return lines.join("\n");
}

/** Messaggio giornaliero: oggi in evidenza + anteprima del resto della settimana. */
export function formatDaily(days: DayMenu[], tr: Translations, lang: Language = "it"): string {
  const loc = locale(lang);
  if (days.length === 0) return "Nessun dato disponibile da matkant.dk.";

  const [today, ...upcoming] = days as [DayMenu, ...DayMenu[]];
  const blocks = [
    `🍽 <b>${loc.ui.botTitle}</b>\n\n${formatDay(today, tr, loc.ui.today, lang)}`,
  ];

  if (upcoming.length > 0) {
    const rest = upcoming.map((day) => {
      const head = `<b>${escapeHtml(localizeHeader(day.header, lang))}</b>`;
      if (!day.open) {
        return `${head}\n🔒 ${escapeHtml(localize(day.closed_text || loc.ui.closed, tr))}`;
      }
      if (!day.has_menu || day.menu.length === 0) {
        return `${head}\n🤷 ${escapeHtml(localize(day.no_menu_text || loc.ui.noMenu, tr))}`;
      }
      const dishes = day.menu
        .map(
          (d) =>
            `${CATEGORY_EMOJI[d.category] ?? "•"} ${localizeWithOriginal(d.name, tr, lang)}`,
        )
        .join("\n");
      return `${head}\n${dishes}`;
    });
    blocks.push(`📅 <b>${loc.ui.upcomingDays}</b>\n\n${rest.join("\n\n")}`);
  }

  return blocks.join("\n\n———\n\n");
}

/** Settimana intera, con tutti i dettagli. */
export function formatWeek(days: DayMenu[], tr: Translations, lang: Language = "it"): string {
  const loc = locale(lang);
  if (days.length === 0) return "Nessun dato disponibile da matkant.dk.";
  return (
    `🍽 <b>${loc.ui.weekTitle}</b>\n\n` +
    days.map((d) => formatDay(d, tr, undefined, lang)).join("\n\n")
  );
}

/** Menù/apertura serale (una o più settimane). */
export function formatEvening(weeks: EveningMenu[], tr: Translations, lang: Language = "it"): string {
  const loc = locale(lang);
  if (weeks.length === 0) return "Nessun dato disponibile da matkant.dk.";

  const blocks = weeks.map((week) => {
    const lines = [
      `<b>${escapeHtml(localizeHeader(week.header, lang))}</b> <i>(${escapeHtml(localizeHeader(week.subheader, lang))})</i>`,
    ];
    if (week.note) lines.push(`<i>${escapeHtml(localize(week.note, tr))}</i>`);

    if (!week.has_open) {
      lines.push(
        `🔒 ${escapeHtml(localize(week.closed_text || loc.ui.closedEvening, tr))}`,
      );
      return lines.join("\n");
    }

    lines.push(
      week.open_week
        .map(
          (d) =>
            `${d.open ? "✅" : "🔒"} ${escapeHtml(localizeHeader(d.day, lang))}: ` +
            escapeHtml(d.open ? loc.ui.open : loc.ui.closed.replace(/\.$/, "")),
        )
        .join("\n"),
    );

    if (week.has_menu && week.menu.length > 0) {
      lines.push(...week.menu.map((d) => formatDish(d, tr, lang)));
      if (week.weight_price) lines.push(`💰 ${week.weight_price} kr. / 100g`);
    } else {
      lines.push(
        `🤷 ${escapeHtml(localize(week.no_menu_text || loc.ui.noMenuPublished, tr))}`,
      );
    }
    return lines.join("\n");
  });

  return `🌙 <b>${loc.ui.eveningTitle}</b>\n\n` + blocks.join("\n\n———\n\n");
}

/** Tutte le stringhe di un menù di pranzo che vanno passate al traduttore. */
export function textsToTranslate(days: DayMenu[], lang: Language = "it"): string[] {
  const texts: string[] = [];
  for (const day of days) {
    texts.push(day.note, day.closed_text, day.no_menu_text);
    for (const dish of day.menu) {
      texts.push(dish.name, ...unknownAllergens(dish.contains_da, lang));
    }
  }
  return texts.filter(Boolean);
}

/** Idem, per il menù serale. */
export function textsToTranslateEvening(weeks: EveningMenu[], lang: Language = "it"): string[] {
  const texts: string[] = [];
  for (const week of weeks) {
    texts.push(week.note ?? "", week.closed_text, week.no_menu_text);
    for (const dish of week.menu) {
      texts.push(dish.name, ...unknownAllergens(dish.contains_da, lang));
    }
  }
  return texts.filter(Boolean);
}
