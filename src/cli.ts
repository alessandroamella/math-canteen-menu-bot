/** Stampa il menù nel terminale, senza toccare Telegram. Utile per provare lo scraper. */

import { fetchDayMenu, fetchEveningMenu, restOfWeek } from "./matkant";
import {
  formatDaily,
  formatEvening,
  formatWeek,
  textsToTranslate,
  textsToTranslateEvening,
} from "./format";
import { provider, translateAll } from "./translate";

/** Rende leggibile in terminale l'HTML che manderemmo a Telegram. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const mode = process.argv[2] ?? "oggi";

let text: string;
if (mode === "sera") {
  const weeks = await fetchEveningMenu();
  text = formatEvening(weeks, await translateAll(textsToTranslateEvening(weeks)));
} else {
  const days = await fetchDayMenu();
  const tr = await translateAll(textsToTranslate(days));
  text = mode === "settimana" ? formatWeek(restOfWeek(days), tr) : formatDaily(days, tr);
}

console.error(`[traduzione: ${provider}]`);
console.log(stripHtml(text));
