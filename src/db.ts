/** SQLite condiviso: iscritti (con lingua) + cache delle traduzioni. */

import { Database } from "bun:sqlite";
import { type Language, isLanguage } from "./locale";

export const db = new Database(process.env.DB_PATH ?? "matkant.sqlite", {
  create: true,
});
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    chat_id     INTEGER PRIMARY KEY,
    language    TEXT NOT NULL DEFAULT 'da',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrazione: i DB creati prima dell'introduzione della lingua non hanno la colonna.
const hasLanguageColumn = db
  .query<{ name: string }, []>("PRAGMA table_info(subscribers)")
  .all()
  .some((c) => c.name === "language");
if (!hasLanguageColumn) {
  db.exec("ALTER TABLE subscribers ADD COLUMN language TEXT NOT NULL DEFAULT 'da';");
}

const insert = db.query<unknown, [number]>(
  "INSERT OR IGNORE INTO subscribers (chat_id) VALUES (?)",
);
const remove = db.query<unknown, [number]>(
  "DELETE FROM subscribers WHERE chat_id = ?",
);
const exists = db.query<{ n: number }, [number]>(
  "SELECT COUNT(*) AS n FROM subscribers WHERE chat_id = ?",
);
const all = db.query<{ chat_id: number }, []>(
  "SELECT chat_id FROM subscribers",
);
const allWithLanguage = db.query<{ chat_id: number; language: string }, []>(
  "SELECT chat_id, language FROM subscribers",
);
const allSubscribers = db.query<
  { chat_id: number; language: string; created_at: string },
  []
>("SELECT chat_id, language, created_at FROM subscribers ORDER BY created_at");
const getLang = db.query<{ language: string }, [number]>(
  "SELECT language FROM subscribers WHERE chat_id = ?",
);
const setLang = db.query<unknown, [string, number]>(
  "UPDATE subscribers SET language = ? WHERE chat_id = ?",
);

/** true se l'iscrizione è nuova. */
export function subscribe(chatId: number): boolean {
  return insert.run(chatId).changes > 0;
}

/** true se c'era davvero un'iscrizione da rimuovere. */
export function unsubscribe(chatId: number): boolean {
  return remove.run(chatId).changes > 0;
}

export function isSubscribed(chatId: number): boolean {
  return (exists.get(chatId)?.n ?? 0) > 0;
}

export function listSubscribers(): number[] {
  return all.all().map((r) => r.chat_id);
}

export interface SubscriberRow {
  chatId: number;
  language: string;
  createdAt: string;
}

/** Tutti gli iscritti con lingua e data di iscrizione, per il dump admin. */
export function listAllSubscribers(): SubscriberRow[] {
  return allSubscribers
    .all()
    .map((r) => ({ chatId: r.chat_id, language: r.language, createdAt: r.created_at }));
}

/** Iscritti raggruppati per lingua, per tradurre/formattare una volta sola a gruppo. */
export function listSubscribersByLanguage(): Map<Language, number[]> {
  const out = new Map<Language, number[]>();
  for (const row of allWithLanguage.all()) {
    const lang: Language = isLanguage(row.language) ? row.language : "da";
    const list = out.get(lang);
    if (list) list.push(row.chat_id);
    else out.set(lang, [row.chat_id]);
  }
  return out;
}

/** Lingua della chat, "da" se non impostata o sconosciuta. */
export function getLanguage(chatId: number): Language {
  const row = getLang.get(chatId);
  return row && isLanguage(row.language) ? row.language : "da";
}

/** Imposta la lingua della chat; se non è ancora iscritta la crea con quella lingua. */
export function setLanguage(chatId: number, lang: Language): void {
  db.transaction(() => {
    insert.run(chatId);
    setLang.run(lang, chatId);
  })();
}
