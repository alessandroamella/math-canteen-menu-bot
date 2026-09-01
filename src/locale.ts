/**
 * Lingue supportate e tabelle di localizzazione (giorni, mesi, allergeni, UI).
 *
 * Il danese ("da") è la lingua sorgente: non viene tradotto, e i testi di UI
 * restano in danese così l'utente vede il menù "così com'è" se lo sceglie.
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
  /** Codice target per l'API di traduzione, null se non serve tradurre (danese). */
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
    open: string;
    weightPrice: (price: string) => string;
    traces: string;
    contains: string;
    weekWord: string;
    tilWord: RegExp;
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
      open: "åben",
      weightPrice: (price) => `${price} kr. / 100g (varm buffet og salater)`,
      traces: "spor af ",
      contains: "indeholder",
      weekWord: "Uge",
      tilWord: /\btil\b/gi,
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
      open: "aperto",
      weightPrice: (price) => `${price} kr. / 100g (buffet caldo e insalate)`,
      traces: "tracce di ",
      contains: "contiene",
      weekWord: "Settimana",
      tilWord: /\btil\b/gi,
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
      open: "otevřeno",
      weightPrice: (price) => `${price} kr. / 100g (teplý bufet a saláty)`,
      traces: "stopy: ",
      contains: "obsahuje",
      weekWord: "Týden",
      tilWord: /\btil\b/gi,
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
      open: "otvorené",
      weightPrice: (price) => `${price} kr. / 100g (teplý bufet a šaláty)`,
      traces: "stopy: ",
      contains: "obsahuje",
      weekWord: "Týždeň",
      tilWord: /\btil\b/gi,
    },
  },
};

export function locale(lang: Language): Locale {
  return LOCALES[lang];
}
