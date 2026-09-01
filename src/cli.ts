/** Stampa il menù nel terminale, senza toccare Telegram. Utile per provare lo scraper. */

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

/** Rende leggibile in terminale l'HTML che manderemmo a Telegram. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const args = process.argv.slice(2);
const langArg = args.find(isLanguage);
const lang: Language = langArg ?? "it";
const mode = args.find((a) => !isLanguage(a)) ?? "oggi";

let text: string;
if (mode === "sera") {
  const weeks = await fetchEveningMenu();
  const tr = await translateAll(textsToTranslateEvening(weeks, lang), locale(lang).translateTo);
  text = formatEvening(weeks, tr, lang);
} else {
  const days = await fetchDayMenu();
  const tr = await translateAll(textsToTranslate(days, lang), locale(lang).translateTo);
  text = mode === "settimana" ? formatWeek(restOfWeek(days), tr, lang) : formatDaily(days, tr, lang);
}

console.error(`[lingua: ${lang}, traduzione: ${provider}]`);
console.log(stripHtml(text));
