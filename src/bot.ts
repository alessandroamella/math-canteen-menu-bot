/** Bot Telegram per il menù della Matematisk Kantine. */

import { Bot, GrammyError, HttpError } from "grammy";
import { isSubscribed, listSubscribers, subscribe, unsubscribe } from "./db";
import {
  formatDaily,
  formatEvening,
  formatWeek,
  textsToTranslate,
  textsToTranslateEvening,
} from "./format";
import { type DayMenu, fetchDayMenu, fetchEveningMenu, restOfWeek } from "./matkant";
import { scheduleDaily } from "./schedule";
import { provider, translateAll, type Translations } from "./translate";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Manca TELEGRAM_BOT_TOKEN (mettilo in .env).");
  process.exit(1);
}

const TZ = process.env.TZ_NAME ?? "Europe/Copenhagen";
const [SEND_HOUR = 9, SEND_MINUTE = 0] = (process.env.SEND_AT ?? "09:00").split(":").map(Number);
/** Se true, nessun messaggio giornaliero nel weekend (mensa chiusa). */
const SKIP_WEEKEND = process.env.SKIP_WEEKEND !== "false";

const bot = new Bot(token);
const send = {
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true }
};

/** Cache brevissima: evita di martellare l'API con più comandi ravvicinati. */
let cache: { at: number; days: DayMenu[] } | null = null;
const CACHE_MS = 5 * 60_000;

async function getDays(): Promise<DayMenu[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.days;
  const days = await fetchDayMenu();
  cache = { at: Date.now(), days };
  return days;
}

/** Menù di pranzo già accompagnato dalle sue traduzioni. */
async function getDaysTranslated(): Promise<[DayMenu[], Translations]> {
  const days = await getDays();
  return [days, await translateAll(textsToTranslate(days))];
}

bot.catch(err => {
  const e = err.error;
  if (e instanceof GrammyError) console.error("Errore API Telegram:", e.description);
  else if (e instanceof HttpError) console.error("Errore di rete:", e);
  else console.error("Errore non gestito:", e);
});

bot.command("start", async ctx => {
  const isNew = subscribe(ctx.chat.id);
  await ctx.reply(
    (isNew
      ? "✅ Iscritto! Ogni giorno ti mando il menù della Matematisk Kantine.\n\n"
      : "Sei già iscritto.\n\n") +
      `Invio giornaliero alle ${String(SEND_HOUR).padStart(2, "0")}:${String(SEND_MINUTE).padStart(2, "0")} (${TZ}).\n\n` +
      "/oggi — menù di oggi e prossimi giorni\n" +
      "/settimana — resto della settimana in dettaglio\n" +
      "/sera — buffet serale\n" +
      "/stop — disiscriviti",
    send
  );
  if (isNew) {
    const [days, tr] = await getDaysTranslated();
    await ctx.reply(formatDaily(days, tr), send);
  }
});

bot.command("stop", async ctx => {
  const removed = unsubscribe(ctx.chat.id);
  await ctx.reply(
    removed
      ? "👋 Disiscritto. Puoi sempre riattivare con /start."
      : "Non eri iscritto. Usa /start per iscriverti."
  );
});

bot.command(["oggi", "today", "menu"], async ctx => {
  await ctx.replyWithChatAction("typing");
  const [days, tr] = await getDaysTranslated();
  await ctx.reply(formatDaily(days, tr), send);
});

bot.command(["settimana", "week"], async ctx => {
  await ctx.replyWithChatAction("typing");
  const [days, tr] = await getDaysTranslated();
  await ctx.reply(formatWeek(restOfWeek(days), tr), send);
});

bot.command(["sera", "evening", "aften"], async ctx => {
  await ctx.replyWithChatAction("typing");
  const weeks = await fetchEveningMenu();
  const tr = await translateAll(textsToTranslateEvening(weeks));
  await ctx.reply(formatEvening(weeks, tr), send);
});

bot.command("status", async ctx => {
  await ctx.reply(
    `Iscrizione a questa chat: ${isSubscribed(ctx.chat.id) ? "attiva" : "non attiva"}\n` +
      `Iscritti totali: ${listSubscribers().length}\n` +
      `Invio: ${String(SEND_HOUR).padStart(2, "0")}:${String(SEND_MINUTE).padStart(2, "0")} ${TZ}` +
      (SKIP_WEEKEND ? " (weekend saltato)" : "")
  );
});

/** Invia il menù del giorno a tutti gli iscritti. */
export async function broadcastDaily(): Promise<void> {
  const chats = listSubscribers();
  if (chats.length === 0) return;

  const days = await fetchDayMenu();
  cache = { at: Date.now(), days };
  const today = days[0];

  if (SKIP_WEEKEND && today && !today.open && !today.has_menu) {
    console.log("[broadcast] mensa chiusa oggi, nessun invio.");
    return;
  }

  const text = formatDaily(days, await translateAll(textsToTranslate(days)));
  let sent = 0;
  for (const chatId of chats) {
    try {
      await bot.api.sendMessage(chatId, text, send);
      sent++;
    } catch (err) {
      // 403 = l'utente ha bloccato il bot; 400 = chat inesistente. Ripuliamo.
      if (err instanceof GrammyError && (err.error_code === 403 || err.error_code === 400)) {
        unsubscribe(chatId);
        console.log(`[broadcast] rimosso ${chatId}: ${err.description}`);
      } else {
        console.error(`[broadcast] invio a ${chatId} fallito:`, err);
      }
    }
    // Telegram limita a ~30 messaggi/s in broadcast.
    await Bun.sleep(50);
  }
  console.log(`[broadcast] inviato a ${sent}/${chats.length} chat.`);
}

await bot.api.setMyCommands([
  { command: "oggi", description: "Menù di oggi e prossimi giorni" },
  { command: "settimana", description: "Resto della settimana in dettaglio" },
  { command: "sera", description: "Buffet serale" },
  { command: "status", description: "Stato dell'iscrizione" },
  { command: "stop", description: "Disiscriviti dall'invio giornaliero" }
]);

const stopSchedule = scheduleDaily(SEND_HOUR, SEND_MINUTE, TZ, broadcastDaily);

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;
    stopSchedule();
    bot
      .stop()
      .catch((err) => console.error("[shutdown] errore durante bot.stop():", err))
      .finally(() => process.exit(0));
  });
}

const me = await bot.api.getMe();
console.log(`Bot @${me.username} avviato (traduzione: ${provider}).`);
await bot.start();
