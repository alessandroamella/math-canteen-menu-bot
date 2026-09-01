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

const HHMM = `${String(SEND_HOUR).padStart(2, "0")}:${String(SEND_MINUTE).padStart(2, "0")}`;

/** Testo dei comandi disponibili, nella lingua della chat, con la riga admin se l'utente lo è. */
function helpText(lang: Language, userId: number | undefined): string {
  const ui = locale(lang).ui;
  return (
    `${ui.dailyAt(HHMM, TZ)}\n\n` +
    `/oggi — ${ui.cmdTodayDesc}\n` +
    `/settimana — ${ui.cmdWeekDesc}\n` +
    `/sera — ${ui.cmdEveningDesc}\n` +
    `/language — ${ui.cmdLanguageDesc}\n` +
    `/stop — ${ui.cmdStopDesc}` +
    (isAdmin(userId) ? `\n/admin — ${ui.cmdAdminDesc}` : "")
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

  const lang = getLanguage(ctx.chat.id);
  await ctx.reply(`${locale(lang).ui.alreadySubscribed}\n\n${helpText(lang, ctx.from?.id)}`, send);
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
    (wasSubscribed ? "" : `${locale(chosen).ui.subscribedIntro}\n\n`) +
      helpText(chosen, ctx.from?.id),
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
  const ui = locale(getLanguage(ctx.chat.id)).ui;
  const removed = unsubscribe(ctx.chat.id);
  await ctx.reply(removed ? ui.stopSuccess : ui.stopNotSubscribed);
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
  const ui = locale(lang).ui;
  await ctx.reply(
    `${ui.statusSubscriptionLabel}: ${isSubscribed(ctx.chat.id) ? ui.statusActive : ui.statusInactive}\n` +
      `${ui.statusLanguageLabel}: ${LANGUAGE_NAMES[lang]}\n` +
      `${ui.statusTotalLabel}: ${listSubscribers().length}\n` +
      `${ui.statusSendLabel}: ${HHMM} ${TZ}` +
      (SKIP_WEEKEND ? ui.statusWeekendSkipped : "")
  );
});

bot.command("admin", async ctx => {
  const ui = locale(getLanguage(ctx.chat.id)).ui;
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply(ui.adminDenied);
    return;
  }

  const subs = listAllSubscribers();
  const cacheStats = translationCacheStats();

  const bylang = new Map<string, number>();
  for (const s of subs) bylang.set(s.language, (bylang.get(s.language) ?? 0) + 1);

  const lines = [
    `${ui.adminHeader} (${provider})\n`,
    `<b>${ui.adminTotalSubs}</b> ${subs.length}`,
    ...[...bylang].map(([lang, n]) => `  • ${LANGUAGE_NAMES[lang as Language] ?? lang}: ${n}`),
    "",
    `<b>${ui.adminSubsListLabel}</b>`,
    ...(subs.length > 0
      ? subs.map((s) => `<code>${s.chatId}</code> — ${s.language} — ${s.createdAt}`)
      : [`  ${ui.adminNone}`]),
    "",
    `<b>${ui.adminCacheHeader}</b>`,
    ...(cacheStats.size > 0
      ? [...cacheStats].map(([lang, n]) => `  • ${lang}: ${n} ${ui.adminCacheEntrySuffix}`)
      : [`  ${ui.adminCacheEmpty}`]),
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

function commandList(lang: Language, admin: boolean): { command: string; description: string }[] {
  const ui = locale(lang).ui;
  const list = [
    { command: "oggi", description: ui.cmdTodayDesc },
    { command: "settimana", description: ui.cmdWeekDesc },
    { command: "sera", description: ui.cmdEveningDesc },
    { command: "language", description: ui.cmdLanguageDesc },
    { command: "status", description: ui.statusSubscriptionLabel },
  ];
  if (admin) list.push({ command: "admin", description: ui.cmdAdminDesc });
  list.push({ command: "stop", description: ui.cmdStopDesc });
  return list;
}

// Lista globale: nessuna lingua è nota in anticipo, quindi resta in danese (la sorgente).
await bot.api.setMyCommands(commandList("da", false));

if (ADMIN_USER_ID !== null) {
  await bot.api.setMyCommands(commandList(getLanguage(ADMIN_USER_ID), true), {
    scope: { type: "chat", chat_id: ADMIN_USER_ID },
  });
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
