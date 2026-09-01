/** Telegram bot for the Matematisk Kantine menu. */

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
  console.error("Missing TELEGRAM_BOT_TOKEN (put it in .env).");
  process.exit(1);
}

const TZ = process.env.TZ_NAME ?? "Europe/Copenhagen";
const [SEND_HOUR = 9, SEND_MINUTE = 0] = (process.env.SEND_AT ?? "09:00").split(":").map(Number);
/** If true, no daily message on weekends (canteen closed). */
const SKIP_WEEKEND = process.env.SKIP_WEEKEND !== "false";
/** Telegram user ID of the admin: the only one authorized to use /admin. */
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? Number(process.env.ADMIN_USER_ID) : null;

function isAdmin(userId: number | undefined): boolean {
  return ADMIN_USER_ID !== null && userId === ADMIN_USER_ID;
}

const bot = new Bot(token);
const send = {
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true }
};

interface CommandDef {
  /** English name: the only one published in Telegram's command menu. */
  primary: string;
  /** Hidden aliases (other languages, old names) — still trigger the command. */
  aliases: string[];
}

/**
 * Command names, English first (published), with hidden aliases in other
 * languages so `/oggi`, `/uge`, `/jazyk`, etc. keep working without showing
 * up in Telegram's command menu.
 */
const COMMANDS = {
  today: { primary: "today", aliases: ["oggi", "idag", "dnes", "menu"] },
  week: { primary: "week", aliases: ["settimana", "uge", "tyden", "tyzden"] },
  evening: { primary: "evening", aliases: ["sera", "aften", "vecer"] },
  language: { primary: "language", aliases: ["lingua", "sprog", "jazyk"] },
  status: { primary: "status", aliases: ["stato"] },
  stop: { primary: "stop", aliases: ["ferma", "zastavit"] },
  admin: { primary: "admin", aliases: [] },
} satisfies Record<string, CommandDef>;

function allNames(cmd: CommandDef): string[] {
  return [cmd.primary, ...cmd.aliases];
}

/** Very short-lived cache: avoids hammering the API with several close-together commands. */
let cache: { at: number; days: DayMenu[] } | null = null;
const CACHE_MS = 5 * 60_000;

async function getDays(): Promise<DayMenu[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.days;
  const days = await fetchDayMenu();
  cache = { at: Date.now(), days };
  return days;
}

/** Lunch menu already paired with its translations towards `lang`. */
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

/** Text of the available commands, in the chat's language, with the admin line if applicable. */
function helpText(lang: Language, userId: number | undefined): string {
  const ui = locale(lang).ui;
  return (
    `${ui.dailyAt(HHMM, TZ)}\n\n` +
    `/${COMMANDS.today.primary} — ${ui.cmdTodayDesc}\n` +
    `/${COMMANDS.week.primary} — ${ui.cmdWeekDesc}\n` +
    `/${COMMANDS.evening.primary} — ${ui.cmdEveningDesc}\n` +
    `/${COMMANDS.language.primary} — ${ui.cmdLanguageDesc}\n` +
    `/${COMMANDS.stop.primary} — ${ui.cmdStopDesc}` +
    (isAdmin(userId) ? `\n/${COMMANDS.admin.primary} — ${ui.cmdAdminDesc}` : "")
  );
}

bot.catch(err => {
  const e = err.error;
  if (e instanceof GrammyError) console.error("Telegram API error:", e.description);
  else if (e instanceof HttpError) console.error("Network error:", e);
  else console.error("Unhandled error:", e);
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

bot.command(allNames(COMMANDS.language), async ctx => {
  await ctx.reply("🌐 Choose your language / Scegli la lingua:", {
    reply_markup: languageKeyboard(),
  });
});

bot.command(allNames(COMMANDS.stop), async ctx => {
  const ui = locale(getLanguage(ctx.chat.id)).ui;
  const removed = unsubscribe(ctx.chat.id);
  await ctx.reply(removed ? ui.stopSuccess : ui.stopNotSubscribed);
});

bot.command(allNames(COMMANDS.today), async ctx => {
  await ctx.replyWithChatAction("typing");
  const lang = getLanguage(ctx.chat.id);
  const [days, tr] = await getDaysTranslated(lang);
  await ctx.reply(formatDaily(days, tr, lang), send);
});

bot.command(allNames(COMMANDS.week), async ctx => {
  await ctx.replyWithChatAction("typing");
  const lang = getLanguage(ctx.chat.id);
  const [days, tr] = await getDaysTranslated(lang);
  await ctx.reply(formatWeek(restOfWeek(days), tr, lang), send);
});

bot.command(allNames(COMMANDS.evening), async ctx => {
  await ctx.replyWithChatAction("typing");
  const lang = getLanguage(ctx.chat.id);
  const weeks = await fetchEveningMenu();
  const tr = await translateAll(textsToTranslateEvening(weeks, lang), locale(lang).translateTo);
  await ctx.reply(formatEvening(weeks, tr, lang), send);
});

bot.command(allNames(COMMANDS.status), async ctx => {
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

bot.command(allNames(COMMANDS.admin), async ctx => {
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

/** Sends today's menu to every subscriber, grouped by language. */
export async function broadcastDaily(): Promise<void> {
  const byLanguage = listSubscribersByLanguage();
  if (byLanguage.size === 0) return;

  const days = await fetchDayMenu();
  cache = { at: Date.now(), days };
  const today = days[0];

  if (SKIP_WEEKEND && today && !today.open && !today.has_menu) {
    console.log("[broadcast] canteen closed today, nothing sent.");
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
        // 403 = the user blocked the bot; 400 = chat no longer exists. Clean up.
        if (err instanceof GrammyError && (err.error_code === 403 || err.error_code === 400)) {
          unsubscribe(chatId);
          console.log(`[broadcast] removed ${chatId}: ${err.description}`);
        } else {
          console.error(`[broadcast] failed to send to ${chatId}:`, err);
        }
      }
      // Telegram limits broadcasts to ~30 messages/s.
      await Bun.sleep(50);
    }
  }
  console.log(`[broadcast] sent to ${sent}/${total} chats.`);
}

function commandList(lang: Language, admin: boolean): { command: string; description: string }[] {
  const ui = locale(lang).ui;
  const list = [
    { command: COMMANDS.today.primary, description: ui.cmdTodayDesc },
    { command: COMMANDS.week.primary, description: ui.cmdWeekDesc },
    { command: COMMANDS.evening.primary, description: ui.cmdEveningDesc },
    { command: COMMANDS.language.primary, description: ui.cmdLanguageDesc },
    { command: COMMANDS.status.primary, description: ui.statusSubscriptionLabel },
  ];
  if (admin) list.push({ command: COMMANDS.admin.primary, description: ui.cmdAdminDesc });
  list.push({ command: COMMANDS.stop.primary, description: ui.cmdStopDesc });
  return list;
}

// Global list: no per-chat language is known in advance, so it's in English.
await bot.api.setMyCommands([
  { command: COMMANDS.today.primary, description: "Today's menu and upcoming days" },
  { command: COMMANDS.week.primary, description: "Rest of the week in detail" },
  { command: COMMANDS.evening.primary, description: "Evening buffet" },
  { command: COMMANDS.language.primary, description: "Change language" },
  { command: COMMANDS.status.primary, description: "Subscription status" },
  { command: COMMANDS.stop.primary, description: "Unsubscribe from the daily menu" },
]);

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
      .catch((err) => console.error("[shutdown] error during bot.stop():", err))
      .finally(() => process.exit(0));
  });
}

const me = await bot.api.getMe();
console.log(`Bot @${me.username} started (translation provider: ${provider}).`);
await bot.start();
