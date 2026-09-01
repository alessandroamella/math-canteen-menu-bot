/** Prints the menu to the terminal, without touching Telegram. Handy to try out the scraper. */

import { fetchDayMenu, fetchEveningMenu, restOfWeek } from "./matkant";
import {
  formatDaily,
  formatEvening,
  formatWeek,
  textsToTranslate,
  textsToTranslateEvening,
} from "./format";
import { isLanguage, locale, type Language } from "./locale";
import { provider, translateAll } from "./translate";

/** Makes the HTML we'd send to Telegram readable in a terminal. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const WEEK_ALIASES = new Set(["week", "settimana"]);
const EVENING_ALIASES = new Set(["evening", "sera"]);

const args = process.argv.slice(2);
const langArg = args.find(isLanguage);
const lang: Language = langArg ?? "it";
const mode = args.find((a) => !isLanguage(a)) ?? "today";

let text: string;
if (EVENING_ALIASES.has(mode)) {
  const weeks = await fetchEveningMenu();
  const tr = await translateAll(textsToTranslateEvening(weeks, lang), locale(lang).translateTo);
  text = formatEvening(weeks, tr, lang);
} else {
  const days = await fetchDayMenu();
  const tr = await translateAll(textsToTranslate(days, lang), locale(lang).translateTo);
  text = WEEK_ALIASES.has(mode) ? formatWeek(restOfWeek(days), tr, lang) : formatDaily(days, tr, lang);
}

console.error(`[language: ${lang}, translation: ${provider}]`);
console.log(stripHtml(text));
