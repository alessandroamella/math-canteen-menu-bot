/** SQLite condiviso: iscritti + cache delle traduzioni. */

import { Database } from "bun:sqlite";

export const db = new Database(process.env.DB_PATH ?? "matkant.sqlite", {
  create: true,
});
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    chat_id     INTEGER PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

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
