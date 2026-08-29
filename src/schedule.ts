/** Scheduler giornaliero, consapevole del fuso orario (e quindi dell'ora legale). */

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    year: +p.year!,
    month: +p.month!,
    day: +p.day!,
    // Intl può emettere "24" per mezzanotte in hourCycle h23/h24.
    hour: +p.hour! % 24,
    minute: +p.minute!,
    second: +p.second!,
  };
}

/** Offset del fuso rispetto a UTC, in ms, valido all'istante `date`. */
function zoneOffset(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Millisecondi fino alla prossima occorrenza di hh:mm nel fuso indicato. */
export function msUntilNext(
  hour: number,
  minute: number,
  timeZone: string,
  now = new Date(),
): number {
  const offset = zoneOffset(now, timeZone);
  const local = partsInZone(now, timeZone);
  let target =
    Date.UTC(local.year, local.month - 1, local.day, hour, minute) - offset;
  if (target <= now.getTime()) {
    target =
      Date.UTC(local.year, local.month - 1, local.day + 1, hour, minute) -
      offset;
  }
  return target - now.getTime();
}

/**
 * Esegue `task` ogni giorno a hh:mm nel fuso indicato. Il ritardo è ricalcolato
 * a ogni giro, così i cambi di ora legale non sfasano l'orario.
 * Restituisce una funzione per fermare lo scheduler.
 */
export function scheduleDaily(
  hour: number,
  minute: number,
  timeZone: string,
  task: () => Promise<void> | void,
): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;

  const arm = () => {
    const delay = msUntilNext(hour, minute, timeZone);
    console.log(
      `[schedule] prossimo invio tra ${Math.round(delay / 60_000)} min ` +
        `(${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${timeZone})`,
    );
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        await task();
      } catch (err) {
        console.error("[schedule] task fallito:", err);
      }
      arm();
    }, delay);
  };

  arm();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
