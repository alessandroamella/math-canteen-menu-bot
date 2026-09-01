/**
 * Supported languages and localization tables (weekdays, months, allergens, UI).
 *
 * Danish ("da") is the source language: it's never translated, and its UI
 * text stays in Danish so a user who picks it sees the menu "as is".
 */

export type Language = "da" | "it" | "cs" | "sk";

export const LANGUAGES: Language[] = ["da", "it", "cs", "sk"];

export const LANGUAGE_NAMES: Record<Language, string> = {
  da: "🇩🇰 Dansk",
  it: "🇮🇹 Italiano",
  cs: "🇨🇿 Čeština",
  sk: "🇸🇰 Slovenčina",
};

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as string[]).includes(value);
}

interface Locale {
  /** Target code for the translation API, null if no translation is needed (Danish). */
  translateTo: string | null;
  weekdays: Record<string, string>;
  months: Record<string, string>;
  allergens: Record<string, string>;
  ui: {
    botTitle: string;
    today: string;
    upcomingDays: string;
    weekTitle: string;
    eveningTitle: string;
    closed: string;
    closedEvening: string;
    noMenu: string;
    noMenuPublished: string;
    noDataAvailable: string;
    open: string;
    weightPrice: (price: string) => string;
    traces: string;
    contains: string;
    weekWord: string;
    tilWord: RegExp;

    // Telegram bot text (menu, commands, status, admin).
    alreadySubscribed: string;
    subscribedIntro: string;
    dailyAt: (hhmm: string, tz: string) => string;
    cmdTodayDesc: string;
    cmdWeekDesc: string;
    cmdEveningDesc: string;
    cmdLanguageDesc: string;
    cmdStopDesc: string;
    cmdAdminDesc: string;
    stopSuccess: string;
    stopNotSubscribed: string;
    statusSubscriptionLabel: string;
    statusActive: string;
    statusInactive: string;
    statusLanguageLabel: string;
    statusTotalLabel: string;
    statusSendLabel: string;
    statusWeekendSkipped: string;
    adminDenied: string;
    adminHeader: string;
    adminTotalSubs: string;
    adminSubsListLabel: string;
    adminNone: string;
    adminCacheHeader: string;
    adminCacheEmpty: string;
    adminCacheEntrySuffix: string;
  };
}

const WEEKDAYS_DA = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
const MONTHS_DA = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

function identityMap(keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, k]));
}

const LOCALES: Record<Language, Locale> = {
  da: {
    translateTo: null,
    weekdays: identityMap(WEEKDAYS_DA),
    months: identityMap(MONTHS_DA),
    allergens: {},
    ui: {
      botTitle: "Matematisk Kantine",
      today: "I dag",
      upcomingDays: "Kommende dage",
      weekTitle: "Matematisk Kantine — ugens menu",
      eveningTitle: "Matematisk Kantine — aftenbuffet (17:00–20:00)",
      closed: "Lukket.",
      closedEvening: "Lukket om aftenen.",
      noMenu: "Ingen menu tilgængelig.",
      noMenuPublished: "Menu endnu ikke offentliggjort.",
      noDataAvailable: "Ingen data tilgængelige fra matkant.dk.",
      open: "åben",
      weightPrice: (price) => `${price} kr. / 100g (varm buffet og salater)`,
      traces: "spor af ",
      contains: "indeholder",
      weekWord: "Uge",
      tilWord: /\btil\b/gi,

      alreadySubscribed: "Du er allerede tilmeldt.",
      subscribedIntro: "✅ Tilmeldt! Hver dag sender jeg dig menuen fra Matematisk Kantine.",
      dailyAt: (hhmm, tz) => `Daglig afsendelse kl. ${hhmm} (${tz}).`,
      cmdTodayDesc: "dagens menu og kommende dage",
      cmdWeekDesc: "resten af ugen i detaljer",
      cmdEveningDesc: "aftenbuffet",
      cmdLanguageDesc: "skift sprog",
      cmdStopDesc: "afmeld dig",
      cmdAdminDesc: "🔐 gemte data (kun admin)",
      stopSuccess: "👋 Afmeldt. Du kan altid tilmelde dig igen med /start.",
      stopNotSubscribed: "Du var ikke tilmeldt. Brug /start for at tilmelde dig.",
      statusSubscriptionLabel: "Tilmelding til denne chat",
      statusActive: "aktiv",
      statusInactive: "ikke aktiv",
      statusLanguageLabel: "Sprog",
      statusTotalLabel: "Tilmeldte i alt",
      statusSendLabel: "Afsendelse",
      statusWeekendSkipped: " (weekend springes over)",
      adminDenied: "⛔ Kommando forbeholdt admin.",
      adminHeader: "🔐 Gemte data",
      adminTotalSubs: "Tilmeldte i alt:",
      adminSubsListLabel: "Tilmeldte (chat_id — sprog — siden):",
      adminNone: "(ingen)",
      adminCacheHeader: "Oversættelsescache pr. sprog:",
      adminCacheEmpty: "(tom)",
      adminCacheEntrySuffix: "strenge",
    },
  },
  it: {
    translateTo: "it",
    weekdays: {
      mandag: "Lunedì",
      tirsdag: "Martedì",
      onsdag: "Mercoledì",
      torsdag: "Giovedì",
      fredag: "Venerdì",
      lørdag: "Sabato",
      søndag: "Domenica",
    },
    months: {
      januar: "gennaio",
      februar: "febbraio",
      marts: "marzo",
      april: "aprile",
      maj: "maggio",
      juni: "giugno",
      juli: "luglio",
      august: "agosto",
      september: "settembre",
      oktober: "ottobre",
      november: "novembre",
      december: "dicembre",
    },
    allergens: {
      gluten: "glutine",
      mælk: "latte",
      æg: "uova",
      soja: "soia",
      jordnødder: "arachidi",
      nødder: "frutta a guscio",
      sesam: "sesamo",
      sennep: "senape",
      selleri: "sedano",
      fisk: "pesce",
      skaldyr: "crostacei",
      bløddyr: "molluschi",
      svovldioxid: "solfiti",
      sulfitter: "solfiti",
      lupin: "lupini",
      oksekød: "manzo",
      okse: "manzo",
      grisekød: "maiale",
      gris: "maiale",
      kylling: "pollo",
      lam: "agnello",
      and: "anatra",
      kalkun: "tacchino",
    },
    ui: {
      botTitle: "Matematisk Kantine",
      today: "Oggi",
      upcomingDays: "Prossimi giorni",
      weekTitle: "Matematisk Kantine — menù della settimana",
      eveningTitle: "Matematisk Kantine — buffet serale (17:00–20:00)",
      closed: "Chiuso.",
      closedEvening: "Chiuso di sera.",
      noMenu: "Nessun menù disponibile.",
      noMenuPublished: "Menù non ancora pubblicato.",
      noDataAvailable: "Nessun dato disponibile da matkant.dk.",
      open: "aperto",
      weightPrice: (price) => `${price} kr. / 100g (buffet caldo e insalate)`,
      traces: "tracce di ",
      contains: "contiene",
      weekWord: "Settimana",
      tilWord: /\btil\b/gi,

      alreadySubscribed: "Sei già iscritto.",
      subscribedIntro: "✅ Iscritto! Ogni giorno ti mando il menù della Matematisk Kantine.",
      dailyAt: (hhmm, tz) => `Invio giornaliero alle ${hhmm} (${tz}).`,
      cmdTodayDesc: "menù di oggi e prossimi giorni",
      cmdWeekDesc: "resto della settimana in dettaglio",
      cmdEveningDesc: "buffet serale",
      cmdLanguageDesc: "cambia lingua",
      cmdStopDesc: "disiscriviti",
      cmdAdminDesc: "🔐 dati salvati (solo admin)",
      stopSuccess: "👋 Disiscritto. Puoi sempre riattivare con /start.",
      stopNotSubscribed: "Non eri iscritto. Usa /start per iscriverti.",
      statusSubscriptionLabel: "Iscrizione a questa chat",
      statusActive: "attiva",
      statusInactive: "non attiva",
      statusLanguageLabel: "Lingua",
      statusTotalLabel: "Iscritti totali",
      statusSendLabel: "Invio",
      statusWeekendSkipped: " (weekend saltato)",
      adminDenied: "⛔ Comando riservato all'admin.",
      adminHeader: "🔐 Dati salvati",
      adminTotalSubs: "Iscritti totali:",
      adminSubsListLabel: "Iscritti (chat_id — lingua — dal):",
      adminNone: "(nessuno)",
      adminCacheHeader: "Cache traduzioni per lingua:",
      adminCacheEmpty: "(vuota)",
      adminCacheEntrySuffix: "stringhe",
    },
  },
  cs: {
    translateTo: "cs",
    weekdays: {
      mandag: "Pondělí",
      tirsdag: "Úterý",
      onsdag: "Středa",
      torsdag: "Čtvrtek",
      fredag: "Pátek",
      lørdag: "Sobota",
      søndag: "Neděle",
    },
    months: {
      januar: "ledna",
      februar: "února",
      marts: "března",
      april: "dubna",
      maj: "května",
      juni: "června",
      juli: "července",
      august: "srpna",
      september: "září",
      oktober: "října",
      november: "listopadu",
      december: "prosince",
    },
    allergens: {
      gluten: "lepek",
      mælk: "mléko",
      æg: "vejce",
      soja: "sója",
      jordnødder: "arašídy",
      nødder: "ořechy",
      sesam: "sezam",
      sennep: "hořčice",
      selleri: "celer",
      fisk: "ryby",
      skaldyr: "korýši",
      bløddyr: "měkkýši",
      svovldioxid: "siřičitany",
      sulfitter: "siřičitany",
      lupin: "vlčí bob",
      oksekød: "hovězí",
      okse: "hovězí",
      grisekød: "vepřové",
      gris: "vepřové",
      kylling: "kuře",
      lam: "jehněčí",
      and: "kachna",
      kalkun: "krůta",
    },
    ui: {
      botTitle: "Matematisk Kantine",
      today: "Dnes",
      upcomingDays: "Nadcházející dny",
      weekTitle: "Matematisk Kantine — týdenní menu",
      eveningTitle: "Matematisk Kantine — večerní bufet (17:00–20:00)",
      closed: "Zavřeno.",
      closedEvening: "Večer zavřeno.",
      noMenu: "Menu není k dispozici.",
      noMenuPublished: "Menu zatím nebylo zveřejněno.",
      noDataAvailable: "Z matkant.dk nejsou k dispozici žádná data.",
      open: "otevřeno",
      weightPrice: (price) => `${price} kr. / 100g (teplý bufet a saláty)`,
      traces: "stopy: ",
      contains: "obsahuje",
      weekWord: "Týden",
      tilWord: /\btil\b/gi,

      alreadySubscribed: "Už jste přihlášeni.",
      subscribedIntro: "✅ Přihlášeno! Každý den vám pošlu menu z Matematisk Kantine.",
      dailyAt: (hhmm, tz) => `Denní odesílání v ${hhmm} (${tz}).`,
      cmdTodayDesc: "dnešní menu a nadcházející dny",
      cmdWeekDesc: "zbytek týdne podrobně",
      cmdEveningDesc: "večerní bufet",
      cmdLanguageDesc: "změnit jazyk",
      cmdStopDesc: "odhlásit se",
      cmdAdminDesc: "🔐 uložená data (pouze admin)",
      stopSuccess: "👋 Odhlášeno. Kdykoli se můžete znovu přihlásit pomocí /start.",
      stopNotSubscribed: "Nebyli jste přihlášeni. Použijte /start pro přihlášení.",
      statusSubscriptionLabel: "Přihlášení k tomuto chatu",
      statusActive: "aktivní",
      statusInactive: "neaktivní",
      statusLanguageLabel: "Jazyk",
      statusTotalLabel: "Celkem přihlášených",
      statusSendLabel: "Odesílání",
      statusWeekendSkipped: " (víkend se přeskakuje)",
      adminDenied: "⛔ Příkaz vyhrazen pro admina.",
      adminHeader: "🔐 Uložená data",
      adminTotalSubs: "Celkem přihlášených:",
      adminSubsListLabel: "Přihlášení (chat_id — jazyk — od):",
      adminNone: "(žádní)",
      adminCacheHeader: "Cache překladů podle jazyka:",
      adminCacheEmpty: "(prázdná)",
      adminCacheEntrySuffix: "řetězců",
    },
  },
  sk: {
    translateTo: "sk",
    weekdays: {
      mandag: "Pondelok",
      tirsdag: "Utorok",
      onsdag: "Streda",
      torsdag: "Štvrtok",
      fredag: "Piatok",
      lørdag: "Sobota",
      søndag: "Nedeľa",
    },
    months: {
      januar: "januára",
      februar: "februára",
      marts: "marca",
      april: "apríla",
      maj: "mája",
      juni: "júna",
      juli: "júla",
      august: "augusta",
      september: "septembra",
      oktober: "októbra",
      november: "novembra",
      december: "decembra",
    },
    allergens: {
      gluten: "lepok",
      mælk: "mlieko",
      æg: "vajcia",
      soja: "sója",
      jordnødder: "arašidy",
      nødder: "orechy",
      sesam: "sezam",
      sennep: "horčica",
      selleri: "zeler",
      fisk: "ryby",
      skaldyr: "kôrovce",
      bløddyr: "mäkkýše",
      svovldioxid: "siričitany",
      sulfitter: "siričitany",
      lupin: "vlčí bôb",
      oksekød: "hovädzie",
      okse: "hovädzie",
      grisekød: "bravčové",
      gris: "bravčové",
      kylling: "kurča",
      lam: "jahňacie",
      and: "kačica",
      kalkun: "morka",
    },
    ui: {
      botTitle: "Matematisk Kantine",
      today: "Dnes",
      upcomingDays: "Nadchádzajúce dni",
      weekTitle: "Matematisk Kantine — týždenné menu",
      eveningTitle: "Matematisk Kantine — večerný bufet (17:00–20:00)",
      closed: "Zatvorené.",
      closedEvening: "Večer zatvorené.",
      noMenu: "Menu nie je k dispozícii.",
      noMenuPublished: "Menu ešte nebolo zverejnené.",
      noDataAvailable: "Z matkant.dk nie sú k dispozícii žiadne dáta.",
      open: "otvorené",
      weightPrice: (price) => `${price} kr. / 100g (teplý bufet a šaláty)`,
      traces: "stopy: ",
      contains: "obsahuje",
      weekWord: "Týždeň",
      tilWord: /\btil\b/gi,

      alreadySubscribed: "Už ste prihlásení.",
      subscribedIntro: "✅ Prihlásené! Každý deň vám pošlem menu z Matematisk Kantine.",
      dailyAt: (hhmm, tz) => `Denné odosielanie o ${hhmm} (${tz}).`,
      cmdTodayDesc: "dnešné menu a nadchádzajúce dni",
      cmdWeekDesc: "zvyšok týždňa podrobne",
      cmdEveningDesc: "večerný bufet",
      cmdLanguageDesc: "zmeniť jazyk",
      cmdStopDesc: "odhlásiť sa",
      cmdAdminDesc: "🔐 uložené dáta (len admin)",
      stopSuccess: "👋 Odhlásené. Kedykoľvek sa môžete znova prihlásiť pomocou /start.",
      stopNotSubscribed: "Neboli ste prihlásení. Použite /start na prihlásenie.",
      statusSubscriptionLabel: "Prihlásenie k tomuto chatu",
      statusActive: "aktívne",
      statusInactive: "neaktívne",
      statusLanguageLabel: "Jazyk",
      statusTotalLabel: "Celkovo prihlásených",
      statusSendLabel: "Odosielanie",
      statusWeekendSkipped: " (víkend sa preskakuje)",
      adminDenied: "⛔ Príkaz vyhradený pre admina.",
      adminHeader: "🔐 Uložené dáta",
      adminTotalSubs: "Celkovo prihlásených:",
      adminSubsListLabel: "Prihlásení (chat_id — jazyk — od):",
      adminNone: "(žiadni)",
      adminCacheHeader: "Cache prekladov podľa jazyka:",
      adminCacheEmpty: "(prázdna)",
      adminCacheEntrySuffix: "reťazcov",
    },
  },
};

export function locale(lang: Language): Locale {
  return LOCALES[lang];
}
