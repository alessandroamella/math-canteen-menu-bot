# Matematisk Kantine → Telegram

Bot Telegram che ogni giorno manda il menù della [Matematisk Kantine](https://www.matkant.dk/menu/dag/) (AU, Aarhus): il pranzo di oggi più i giorni successivi, tradotto dal danese nella lingua scelta da ogni utente (danese, italiano, ceco o slovacco).

La pagina del menù è renderizzata lato client, quindi invece di fare parsing dell'HTML il bot legge direttamente il JSON che usa il sito:

- `https://www.matkant.dk/data/m/d` — menù di pranzo, ~8 giorni a partire da oggi
- `https://www.matkant.dk/data/m/e` — apertura e buffet serale, per settimana

## Setup

```sh
bun install
cp .env.example .env   # incolla il token di @BotFather
bun start
```

Bun carica `.env` da solo.

| Variabile | Default | Cosa fa |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | — | Token di @BotFather (obbligatorio) |
| `SEND_AT` | `09:00` | Ora dell'invio giornaliero |
| `TZ_NAME` | `Europe/Copenhagen` | Fuso in cui interpretare `SEND_AT` (l'ora legale è gestita) |
| `SKIP_WEEKEND` | `true` | Salta l'invio quando la mensa è chiusa |
| `DB_PATH` | `matkant.sqlite` | File SQLite con iscritti (e relativa lingua) e cache traduzioni |
| `ADMIN_USER_ID` | — | ID utente Telegram dell'admin: sblocca `/admin` (dati salvati) |
| `TRANSLATE_PROVIDER` | `mymemory` | `google`, `deepl`, `mymemory` o `none` |
| `GOOGLE_TRANSLATE_API_KEY` | — | Chiave Cloud Translation v2 |
| `DEEPL_API_KEY` | — | Chiave DeepL (`:fx` = piano free) |
| `MYMEMORY_EMAIL` | — | Alza la quota MyMemory da 5k a 50k caratteri/giorno |
| `SHOW_ORIGINAL` | `true` | Mostra il nome danese accanto alla traduzione |

## Lingua

Ogni chat sceglie la propria lingua (danese, italiano, ceco o slovacco) con la
tastiera che compare al primo `/start` o con `/language`, e può cambiarla in
qualsiasi momento. La preferenza è salvata nella colonna `language` della
tabella `subscribers` in SQLite — stesso database usato per iscritti e cache
delle traduzioni, nessuno storage separato.

## Traduzione

I nomi dei piatti passano per un'API di traduzione verso la lingua scelta; date
e allergeni comuni usano invece tabelle locali per lingua (`src/locale.ts`),
che sono deterministiche e non consumano quota. Scegliendo il danese non viene
fatta alcuna chiamata di traduzione: il menù resta così com'è.

Se `TRANSLATE_PROVIDER` non è impostato si sceglie `google` o `deepl` quando c'è
la chiave corrispondente, altrimenti `mymemory`, che funziona senza registrarsi.
Ogni stringa è tradotta una volta sola per lingua e poi riletta dalla cache
SQLite, quindi la quota si consuma solo sui piatti nuovi. L'invio giornaliero
raggruppa gli iscritti per lingua e traduce una volta sola per gruppo, non per
utente. Se l'API fallisce il menù arriva comunque, in danese.

Esempio di riga tradotta:

```
🥗 Torta di patate all'uovo con verdure (vegetariana) (Kartoffel æggekage med grøntsager (vegetarisk))
   contiene: latte, uova
```

Con `SHOW_ORIGINAL=false` sparisce la parte fra parentesi.

## Comandi del bot

- `/start` — iscriviti all'invio giornaliero (al primo avvio chiede la lingua)
- `/language` — scegli o cambia lingua (danese, italiano, ceco, slovacco)
- `/oggi` — menù di oggi + anteprima dei prossimi giorni
- `/settimana` — resto della settimana, con allergeni e prezzi
- `/sera` — buffet serale
- `/status` — stato dell'iscrizione e lingua attiva
- `/stop` — disiscriviti
- `/admin` — 🔐 solo per `ADMIN_USER_ID`: dump di tutti gli iscritti (chat_id, lingua, data) e della cache traduzioni

## Senza Telegram

```sh
bun run menu                # oggi + prossimi giorni, italiano
bun run menu settimana
bun run menu sera
bun run menu settimana cs   # in ceco
bun run menu da             # in danese, senza traduzione
```

## Test

```sh
bun test
```

## Struttura

- `src/matkant.ts` — client dell'API, tipi, ritaglio della settimana
- `src/locale.ts` — lingue supportate e tabelle di localizzazione (giorni, mesi, allergeni, UI)
- `src/translate.ts` — traduzione da → lingua scelta multi-provider, con cache per lingua
- `src/format.ts` — messaggi HTML per Telegram, localizzati per lingua
- `src/db.ts` — iscritti (con lingua) e cache traduzioni su `bun:sqlite`
- `src/schedule.ts` — scheduler giornaliero con fuso orario
- `src/bot.ts` — bot grammY, comandi, scelta lingua e broadcast per gruppo di lingua
# math-canteen-menu-bot
