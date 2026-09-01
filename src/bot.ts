/** Bot Telegram per il menù della Matematisk Kantine. */

import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import {
  getLanguage,
  isSubscribed,
  listAllSubscribers,
  listSubscribers,
  listSubscribersByLanguage,
  setLanguage,
  unsubscribe,
} from "./db";
import {
  formatDaily,
  formatEvening,
  formatWeek,
  textsToTranslate,
  textsToTranslateEvening,
} from "./format";
import { LANGUAGE_NAMES, LANGUAGES, isLanguage, locale, type Language } from "./locale";
import { type DayMenu, fetchDayMenu, fetchEveningMenu, restOfWeek } from "./matkant";
import { scheduleDaily } from "./schedule";
import { provider, translateAll, translationCacheStats, type Translations } from "./translate";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Manca TELEGRAM_BOT_TOKEN (mettilo in .env).");
  process.exit(1);
}

const TZ = process.env.TZ_NAME ?? "Europe/Copenhagen";
const [SEND_HOUR = 9, SEND_MINUTE = 0] = (process.env.SEND_AT ?? "09:00").split(":").map(Number);
/** Se true, nessun messaggio giornaliero nel weekend (mensa chiusa). */
const SKIP_WEEKEND = process.env.SKIP_WEEKEND !== "false";
/** ID utente Telegram dell'admin: unico autorizzato a /admin. */
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? Number(process.env.ADMIN_USER_ID) : null;

function isAdmin(userId: number | undefined): boolean {
  return ADMIN_USER_ID !== null && userId === ADMIN_USER_ID;
}

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

/** Menù di pranzo già accompagnato dalle sue traduzioni verso `lang`. */
async function getDaysTranslated(lang: Language): Promise<[DayMenu[], Translations]> {
  const days = await getDays();
  return [days, await translateAll(textsToTranslate(days, lang), locale(lang).translateTo)];
}

function languageKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const lang of LANGUAGES) {
    kb.text(LANGUAGE_NAMES[lang], `lang:${lang}`).row();
  }
  return kb;
}

/** Testo dei comandi disponibili, con la riga admin se l'utente lo è. */
function helpText(userId: number | undefined): string {
  return (
    `Invio giornaliero alle ${String(SEND_HOUR).padStart(2, "0")}:${String(SEND_MINUTE).padStart(2, "0")} (${TZ}).\n\n` +
    "/oggi — menù di oggi e prossimi giorni\n" +
    "/settimana — resto della settimana in dettaglio\n" +
    "/sera — buffet serale\n" +
    "/language — cambia lingua\n" +
    "/stop — disiscriviti" +
    (isAdmin(userId) ? "\n/admin — 🔐 dati salvati (solo admin)" : "")
  );
}

bot.catch(err => {
  const e = err.error;
  if (e instanceof GrammyError) console.error("Errore API Telegram:", e.description);
  else if (e instanceof HttpError) console.error("Errore di rete:", e);
  else console.error("Errore non gestito:", e);
});

bot.command("start", async ctx => {
  if (!isSubscribed(ctx.chat.id)) {
    await ctx.reply(
      "👋 Welcome! Choose your language / Scegli la lingua / Vyberte jazyk / Vyberte jazyk:",
      { reply_markup: languageKeyboard() },
    );
    return;
  }

  await ctx.reply("Sei già iscritto.\n\n" + helpText(ctx.from?.id), send);
});

bot.callbackQuery(/^lang:(.+)$/, async ctx => {
  const chosen = ctx.match[1];
  if (!chosen || !isLanguage(chosen) || !ctx.chat) {
    await ctx.answerCallbackQuery();
    return;
  }
  const wasSubscribed = isSubscribed(ctx.chat.id);
  setLanguage(ctx.chat.id, chosen);
  await ctx.answerCallbackQuery({ text: LANGUAGE_NAMES[chosen] });
  await ctx.editMessageText(`✅ ${LANGUAGE_NAMES[chosen]}`);

  await ctx.reply(
    (wasSubscribed
      ? ""
      : "✅ Iscritto! Ogni giorno ti mando il menù della Matematisk Kantine.\n\n") +
      helpText(ctx.from?.id),
    send
  );

  if (!wasSubscribed) {
    const [days, tr] = await getDaysTranslated(chosen);
    await ctx.reply(formatDaily(days, tr, chosen), send);
  }
});

bot.command("language", async ctx => {
  await ctx.reply("🌐 Choose your language / Scegli la lingua:", {
    reply_markup: languageKeyboard(),
  });
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
  const lang = getLanguage(ctx.chat.id);
  const [days, tr] = await getDaysTranslated(lang);
  await ctx.reply(formatDaily(days, tr, lang), send);
});

bot.command(["settimana", "week"], async ctx => {
  await ctx.replyWithChatAction("typing");
  const lang = getLanguage(ctx.chat.id);
  const [days, tr] = await getDaysTranslated(lang);
  await ctx.reply(formatWeek(restOfWeek(days), tr, lang), send);
});

bot.command(["sera", "evening", "aften"], async ctx => {
  await ctx.replyWithChatAction("typing");
  const lang = getLanguage(ctx.chat.id);
  const weeks = await fetchEveningMenu();
  const tr = await translateAll(textsToTranslateEvening(weeks, lang), locale(lang).translateTo);
  await ctx.reply(formatEvening(weeks, tr, lang), send);
});

bot.command("status", async ctx => {
  const lang = getLanguage(ctx.chat.id);
  await ctx.reply(
    `Iscrizione a questa chat: ${isSubscribed(ctx.chat.id) ? "attiva" : "non attiva"}\n` +
      `Lingua: ${LANGUAGE_NAMES[lang]}\n` +
      `Iscritti totali: ${listSubscribers().length}\n` +
      `Invio: ${String(SEND_HOUR).padStart(2, "0")}:${String(SEND_MINUTE).padStart(2, "0")} ${TZ}` +
      (SKIP_WEEKEND ? " (weekend saltato)" : "")
  );
});

bot.command("admin", async ctx => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply("⛔ Comando riservato all'admin.");
    return;
  }

  const subs = listAllSubscribers();
  const cacheStats = translationCacheStats();

  const bylang = new Map<string, number>();
  for (const s of subs) bylang.set(s.language, (bylang.get(s.language) ?? 0) + 1);

  const lines = [
    `🔐 <b>Dati salvati</b> (${provider})\n`,
    `<b>Iscritti totali:</b> ${subs.length}`,
    ...[...bylang].map(([lang, n]) => `  • ${LANGUAGE_NAMES[lang as Language] ?? lang}: ${n}`),
    "",
    "<b>Iscritti (chat_id — lingua — dal):</b>",
    ...(subs.length > 0
      ? subs.map((s) => `<code>${s.chatId}</code> — ${s.language} — ${s.createdAt}`)
      : ["  (nessuno)"]),
    "",
    "<b>Cache traduzioni per lingua:</b>",
    ...(cacheStats.size > 0
      ? [...cacheStats].map(([lang, n]) => `  • ${lang}: ${n} stringhe`)
      : ["  (vuota)"]),
  ];

  await ctx.reply(lines.join("\n"), send);
});

/** Invia il menù del giorno a tutti gli iscritti, raggruppati per lingua. */
export async function broadcastDaily(): Promise<void> {
  const byLanguage = listSubscribersByLanguage();
  if (byLanguage.size === 0) return;

  const days = await fetchDayMenu();
  cache = { at: Date.now(), days };
  const today = days[0];

  if (SKIP_WEEKEND && today && !today.open && !today.has_menu) {
    console.log("[broadcast] mensa chiusa oggi, nessun invio.");
    return;
  }

  let sent = 0;
  let total = 0;
  for (const [lang, chats] of byLanguage) {
    total += chats.length;
    const tr = await translateAll(textsToTranslate(days, lang), locale(lang).translateTo);
    const text = formatDaily(days, tr, lang);
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
  }
  console.log(`[broadcast] inviato a ${sent}/${total} chat.`);
}

await bot.api.setMyCommands([
  { command: "oggi", description: "Menù di oggi e prossimi giorni" },
  { command: "settimana", description: "Resto della settimana in dettaglio" },
  { command: "sera", description: "Buffet serale" },
  { command: "language", description: "Cambia lingua / Change language" },
  { command: "status", description: "Stato dell'iscrizione" },
  { command: "stop", description: "Disiscriviti dall'invio giornaliero" }
]);

if (ADMIN_USER_ID !== null) {
  await bot.api.setMyCommands(
    [
      { command: "oggi", description: "Menù di oggi e prossimi giorni" },
      { command: "settimana", description: "Resto della settimana in dettaglio" },
      { command: "sera", description: "Buffet serale" },
      { command: "language", description: "Cambia lingua / Change language" },
      { command: "status", description: "Stato dell'iscrizione" },
      { command: "admin", description: "🔐 Dati salvati (solo admin)" },
      { command: "stop", description: "Disiscriviti dall'invio giornaliero" }
    ],
    { scope: { type: "chat", chat_id: ADMIN_USER_ID } }
  );
}

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
