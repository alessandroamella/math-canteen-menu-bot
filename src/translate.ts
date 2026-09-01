/**
 * Danish → chosen language translation (Italian, Czech, Slovak), with a
 * persistent cache.
 *
 * Dish names repeat a lot from one day to the next, so each string is
 * translated once per language and then read back from SQLite: the API
 * quota is only spent on new content.
 *
 * Provider (env `TRANSLATE_PROVIDER`):
 *   google   — Cloud Translation v2, requires GOOGLE_TRANSLATE_API_KEY
 *   deepl    — requires DEEPL_API_KEY (":fx" suffix = free plan)
 *   mymemory — free, no key needed (default), higher quota with MYMEMORY_EMAIL
 *   none     — translation disabled, keeps the Danish text
 */

import { db } from "./db";

export type Provider = "google" | "deepl" | "mymemory" | "none";

const SOURCE = "da";

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
    target      TEXT NOT NULL,
    translated  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (provider, source, target)
  );
`);

// Migration: earlier versions only translated to Italian and had no `target`
// column. It's just a cache, so we recreate it from scratch.
const hasTargetColumn = db
  .query<{ name: string }, []>("PRAGMA table_info(translations)")
  .all()
  .some((c) => c.name === "target");
if (!hasTargetColumn) {
  db.exec("DROP TABLE translations;");
  db.exec(`
    CREATE TABLE translations (
      provider    TEXT NOT NULL,
      source      TEXT NOT NULL,
      target      TEXT NOT NULL,
      translated  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, source, target)
    );
  `);
}

const readCache = db.query<{ translated: string }, [string, string, string]>(
  "SELECT translated FROM translations WHERE provider = ? AND source = ? AND target = ?",
);
const writeCache = db.query<unknown, [string, string, string, string]>(
  "INSERT OR REPLACE INTO translations (provider, source, target, translated) VALUES (?, ?, ?, ?)",
);

/** Map of original text → translation. Untranslated texts don't appear. */
export type Translations = Map<string, string>;

const cacheCountByTarget = db.query<{ target: string; n: number }, []>(
  "SELECT target, COUNT(*) AS n FROM translations GROUP BY target",
);

/** Number of cached strings per target language, for the admin dump. */
export function translationCacheStats(): Map<string, number> {
  return new Map(cacheCountByTarget.all().map((r) => [r.target, r.n]));
}

function fail(res: Response, body: string): never {
  throw new Error(
    `Translation failed (${provider}): ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
  );
}

/** Cloud Translation v2: the whole batch fits in one request. */
async function translateGoogle(texts: string[], target: string): Promise<string[]> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_TRANSLATE_API_KEY.");

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        q: texts,
        source: SOURCE,
        target,
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

/** DeepL: the batch also fits in a single request here. */
async function translateDeepl(texts: string[], target: string): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error("Missing DEEPL_API_KEY.");
  // Free-plan keys end in ":fx" and use a different host.
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
      target_lang: target.toUpperCase(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) fail(res, await res.text());

  const json = (await res.json()) as { translations: { text: string }[] };
  return json.translations.map((t) => t.text);
}

/** MyMemory: one string per request, so they're sent sequentially. */
async function translateMyMemory(texts: string[], target: string): Promise<string[]> {
  const out: string[] = [];
  for (const text of texts) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${SOURCE}|${target}`);
    // Declaring an email raises the anonymous quota from 5k to 50k chars/day.
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
        `MyMemory rejected the request (status ${json.responseStatus}` +
          `${json.quotaFinished ? ", quota exhausted" : ""}).`,
      );
    }
    out.push(json.responseData.translatedText);
  }
  return out;
}

function callProvider(texts: string[], target: string): Promise<string[]> {
  switch (provider) {
    case "google":
      return translateGoogle(texts, target);
    case "deepl":
      return translateDeepl(texts, target);
    case "mymemory":
      return translateMyMemory(texts, target);
    case "none":
      return Promise.resolve(texts);
  }
}

/**
 * Requests already out for a given (target, text) pair, keyed by
 * `target::text`. Several chats/language groups can ask for the same dish
 * name at the same time (e.g. the daily broadcast fanning out); without this
 * they'd each fire their own provider request before any of them had a
 * chance to populate the SQLite cache — a thundering herd against the
 * translation API. Callers arriving while a request is in flight just await
 * it instead.
 */
const inFlight = new Map<string, Promise<string | undefined>>();

/**
 * Translates a set of strings towards `target`, using the cache where
 * possible. If `target` is null (Danish, the source language) it returns an
 * empty map right away: there's nothing to translate.
 * If the API fails it doesn't throw: it returns only what was already
 * cached, so a network hiccup degrades to Danish instead of breaking the menu.
 */
export async function translateAll(
  texts: Iterable<string>,
  target: string | null,
): Promise<Translations> {
  const result: Translations = new Map();
  if (provider === "none" || !target) return result;

  const toFetch: string[] = [];
  const pending: { text: string; promise: Promise<string | undefined> }[] = [];

  for (const raw of texts) {
    const text = raw.trim();
    if (!text || result.has(text) || pending.some((p) => p.text === text)) continue;

    const hit = readCache.get(provider, text, target);
    if (hit) {
      result.set(text, hit.translated);
      continue;
    }

    const key = `${target}::${text}`;
    const existing = inFlight.get(key);
    if (existing) {
      pending.push({ text, promise: existing });
    } else if (!toFetch.includes(text)) {
      toFetch.push(text);
    }
  }

  if (toFetch.length > 0) {
    const batch = (async (): Promise<(string | undefined)[]> => {
      try {
        const translated = await callProvider(toFetch, target);
        db.transaction(() => {
          toFetch.forEach((source, i) => {
            const value = translated[i];
            if (value) writeCache.run(provider, source, target, value);
          });
        })();
        return translated;
      } catch (err) {
        console.error("[translate] translation skipped, staying in Danish:", err);
        return [];
      }
    })();

    toFetch.forEach((text, i) => {
      const key = `${target}::${text}`;
      const promise = batch.then((translated) => translated[i]);
      inFlight.set(key, promise);
      promise.finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });
      pending.push({ text, promise });
    });
  }

  for (const { text, promise } of pending) {
    const value = await promise;
    if (value) result.set(text, value);
  }

  return result;
}
