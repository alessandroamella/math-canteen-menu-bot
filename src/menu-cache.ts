/**
 * Fetches and caches matkant.dk menus.
 *
 * Beyond the plain TTL, concurrent callers hitting a cache miss at the same
 * time share a single in-flight request instead of each firing their own
 * fetch — otherwise a burst of commands (or the daily broadcast overlapping
 * a user command) would thunder-herd the upstream API.
 */

import { type DayMenu, type EveningMenu, fetchDayMenu, fetchEveningMenu } from "./matkant";

const CACHE_MS = 5 * 60_000;

interface Cached<T> {
  at: number;
  data: T;
}

function cachedFetcher<T>(fetcher: () => Promise<T>) {
  let cached: Cached<T> | null = null;
  let inFlight: Promise<T> | null = null;

  async function get(): Promise<T> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    if (inFlight) return inFlight;

    inFlight = fetcher()
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return { get };
}

const dayMenu = cachedFetcher(fetchDayMenu);
const eveningMenu = cachedFetcher(fetchEveningMenu);

/** Today's lunch menu + upcoming days, from cache when fresh enough. */
export function getDayMenu(): Promise<DayMenu[]> {
  return dayMenu.get();
}

/** Evening menu/opening hours, from cache when fresh enough. */
export function getEveningMenu(): Promise<EveningMenu[]> {
  return eveningMenu.get();
}
