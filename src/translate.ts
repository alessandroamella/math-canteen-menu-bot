/**
 * Traduzione danese → italiano, con cache persistente.
 *
 * I nomi dei piatti si ripetono molto tra un giorno e l'altro, quindi ogni
 * stringa viene tradotta una volta sola e poi riletta da SQLite: la quota
 * dell'API si consuma solo sulle novità.
 *
 * Provider (env `TRANSLATE_PROVIDER`):
 *   google   — Cloud Translation v2, richiede GOOGLE_TRANSLATE_API_KEY
 *   deepl    — richiede DEEPL_API_KEY (suffisso `:fx` = piano free)
 *   mymemory — gratuito e senza chiave (default), quota più alta con MYMEMORY_EMAIL
 *   none     — traduzione disattivata, si tiene il danese
 */

import { db } from "./db";

export type Provider = "google" | "deepl" | "mymemory" | "none";

const SOURCE = "da";
const TARGET = "it";

export const provider: Provider = (process.env.TRANSLATE_PROVIDER ??
  (process.env.GOOGLE_TRANSLATE_API_KEY
    ? "google"
    : process.env.DEEPL_API_KEY
      ? "deepl"
      : "mymemory")) as Provider;

db.exec(`
  CREATE TABLE IF NOT EXISTS translations (
    provider    TEXT NOT NULL,
    source      TEXT NOT NULL,
    translated  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (provider, source)
  );
`);

const readCache = db.query<{ translated: string }, [string, string]>(
  "SELECT translated FROM translations WHERE provider = ? AND source = ?",
);
const writeCache = db.query<unknown, [string, string, string]>(
  "INSERT OR REPLACE INTO translations (provider, source, translated) VALUES (?, ?, ?)",
);

/** Mappa testo originale → traduzione. I testi non tradotti non compaiono. */
export type Translations = Map<string, string>;

function fail(res: Response, body: string): never {
  throw new Error(
    `Traduzione fallita (${provider}): ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
  );
}

/** Cloud Translation v2: accetta l'intero batch in una richiesta. */
async function translateGoogle(texts: string[]): Promise<string[]> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("Manca GOOGLE_TRANSLATE_API_KEY.");

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        q: texts,
        source: SOURCE,
        target: TARGET,
        format: "text",
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) fail(res, await res.text());

  const json = (await res.json()) as {
    data: { translations: { translatedText: string }[] };
  };
  return json.data.translations.map((t) => t.translatedText);
}

/** DeepL: anche qui il batch sta in una sola richiesta. */
async function translateDeepl(texts: string[]): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error("Manca DEEPL_API_KEY.");
  // Le chiavi del piano free finiscono con ":fx" e usano un host diverso.
  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";

  const res = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      source_lang: "DA",
      target_lang: "IT",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) fail(res, await res.text());

  const json = (await res.json()) as { translations: { text: string }[] };
  return json.translations.map((t) => t.text);
}

/** MyMemory: una stringa per richiesta, quindi le mandiamo in sequenza. */
async function translateMyMemory(texts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const text of texts) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${SOURCE}|${TARGET}`);
    // Dichiarare un'email alza la quota anonima da 5k a 50k caratteri/giorno.
    if (process.env.MYMEMORY_EMAIL) {
      url.searchParams.set("de", process.env.MYMEMORY_EMAIL);
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) fail(res, await res.text());

    const json = (await res.json()) as {
      responseStatus: number | string;
      responseData: { translatedText: string };
      quotaFinished?: boolean;
    };
    if (Number(json.responseStatus) !== 200 || json.quotaFinished) {
      throw new Error(
        `MyMemory ha rifiutato la richiesta (status ${json.responseStatus}` +
          `${json.quotaFinished ? ", quota esaurita" : ""}).`,
      );
    }
    out.push(json.responseData.translatedText);
  }
  return out;
}

function callProvider(texts: string[]): Promise<string[]> {
  switch (provider) {
    case "google":
      return translateGoogle(texts);
    case "deepl":
      return translateDeepl(texts);
    case "mymemory":
      return translateMyMemory(texts);
    case "none":
      return Promise.resolve(texts);
  }
}

/**
 * Traduce un insieme di stringhe, usando la cache dove possibile.
 * Se l'API fallisce non solleva: restituisce solo ciò che era già in cache,
 * così un contrattempo di rete degrada al danese invece di far saltare il menù.
 */
export async function translateAll(texts: Iterable<string>): Promise<Translations> {
  const result: Translations = new Map();
  if (provider === "none") return result;

  const missing: string[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    if (!text || result.has(text)) continue;
    const hit = readCache.get(provider, text);
    if (hit) result.set(text, hit.translated);
    else if (!missing.includes(text)) missing.push(text);
  }
  if (missing.length === 0) return result;

  try {
    const translated = await callProvider(missing);
    db.transaction(() => {
      missing.forEach((source, i) => {
        const value = translated[i];
        if (!value) return;
        writeCache.run(provider, source, value);
        result.set(source, value);
      });
    })();
  } catch (err) {
    console.error("[translate] traduzione saltata, resto in danese:", err);
  }
  return result;
}
