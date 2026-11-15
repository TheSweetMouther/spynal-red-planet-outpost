import type { DonkiFlare, DonkiSep } from './donki-mapping';
import { addDays } from './donki-mapping';
import { flaresFromNotifications, NOTIFICATION_THRESHOLD, type DonkiCme, type DonkiNotification } from './donki-notifications';
import type { DonkiSnapshot } from './scenarios';

// Data loading with an honest fallback chain for "Today's Sun":
//   1. new DONKI endpoint (CCMC, no key)
//   2. old DONKI endpoint (api.nasa.gov, your key or DEMO_KEY)
//   3. the last good live download, kept in the browser
//   4. the newest saved snapshot
// The result always says whether it is LIVE or ARCHIVED. Archived data is
// never labelled as live.

export const DONKI_NEW = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';
export const DONKI_OLD = 'https://api.nasa.gov/DONKI';
export const SNAPSHOT_BASE = './data/donki/';

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface DataStatus {
  kind: 'live' | 'archived';
  /** Where this copy came from: a live download, the browser's saved copy of one, or a bundled snapshot. */
  origin: 'live' | 'cache' | 'snapshot';
  /** True when the player pressed Cancel instead of waiting for NASA. */
  cancelled?: boolean;
  /** When the data was downloaded from DONKI (ISO). */
  fetchedAt: string;
  /** First and last day of data (YYYY-MM-DD). */
  dataStart: string;
  dataEnd: string;
  source: string;
  partial: boolean;
  /** 'notifications' when DONKI's flare list was down and its flare alerts (M5.0 and bigger) were used. */
  flareSource?: 'FLR' | 'notifications';
  /** Why live data was not used, in plain words (only for "Today's Sun"). */
  reason?: string;
}

export interface Loaded {
  snapshot: DonkiSnapshot;
  status: DataStatus;
}

export interface SnapshotIndexEntry {
  id: string;
  file: string;
  kind: 'replay' | 'recent';
  title: string;
  start: string;
  end: string;
  fetched_at: string;
  source?: string;
  source_endpoint?: string;
  flares?: number;
  particleEvents?: number;
  flare_source?: 'FLR' | 'notifications';
  flr_problem?: string;
  flares_from_archive?: number;
  marsObserved?: boolean;
  blurb?: string;
  partial?: boolean;
}

/** DONKI answers with an empty body when nothing happened. HTML means "wrong page". */
export function parseDonkiArray(text: string): unknown[] {
  const t = text.trim();
  if (t === '') return [];
  if (t.startsWith('<')) throw new Error('Got a web page instead of data');
  const data: unknown = JSON.parse(t);
  if (!Array.isArray(data)) throw new Error('Data was not a list');
  return data;
}

async function getArray(fetchImpl: FetchLike, url: string, timeoutMs: number, outer?: AbortSignal): Promise<unknown[]> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (outer?.aborted) abort();
  outer?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The timer also rejects by itself, in case a fetch ignores the abort signal.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort();
      const err = new Error('Timed out');
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });
  const request = (async () => {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseDonkiArray(await res.text());
  })();
  request.catch(() => {}); // a late failure after the timeout is not an unhandled error
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}

export function archivedStatus(snapshot: DonkiSnapshot, reason?: string): DataStatus {
  return {
    kind: 'archived',
    origin: 'snapshot',
    fetchedAt: snapshot.fetched_at,
    dataStart: snapshot.window.start,
    dataEnd: snapshot.window.end,
    source: snapshot.source_endpoint ?? snapshot.source,
    partial: Boolean(snapshot.partial),
    flareSource: snapshot.flare_source,
    reason,
  };
}

async function getJson<T>(fetchImpl: FetchLike, url: string): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(await res.text()) as T;
}

export async function loadIndex(fetchImpl: FetchLike, base = SNAPSHOT_BASE): Promise<SnapshotIndexEntry[]> {
  return getJson<SnapshotIndexEntry[]>(fetchImpl, `${base}index.json`);
}

export async function loadSnapshot(id: string, fetchImpl: FetchLike, base = SNAPSHOT_BASE): Promise<Loaded> {
  const snapshot = await getJson<DonkiSnapshot>(fetchImpl, `${base}${id}.json`);
  return { snapshot, status: archivedStatus(snapshot) };
}

/** Newest saved snapshot: the "recent" one if it exists, else the one with the latest data. */
export async function loadLatestSnapshot(fetchImpl: FetchLike, base = SNAPSHOT_BASE): Promise<Loaded> {
  const index = await loadIndex(fetchImpl, base);
  if (index.length === 0) throw new Error('No saved snapshots');
  const best = [...index].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'recent' ? -1 : 1;
    return b.end.localeCompare(a.end);
  })[0];
  return loadSnapshot(best.id, fetchImpl, base);
}

/** Somewhere to keep the last good live download (localStorage in the browser). */
export interface LiveCache {
  read(): string | null;
  write(value: string): void;
}

export const CACHE_KEY = 'red-planet-outpost.donki.recent.v1';

export interface RecentOptions {
  fetchImpl: FetchLike;
  now: Date;
  days?: number;
  /** Longest wait for one endpoint. */
  timeoutMs?: number;
  /** If the first endpoint has not answered after this long, the second is asked too. */
  hedgeMs?: number;
  base?: string;
  /** api.nasa.gov key. DEMO_KEY works but is rate limited. */
  apiKey?: string;
  cache?: LiveCache;
  /** Abort to skip the wait and go straight to saved data (the Cancel button). */
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function problemText(err: unknown): string {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return 'no answer in time';
  return err instanceof Error ? err.message : String(err);
}

/** The last good live download, if one was saved and still looks right. */
export function readCachedLive(cache: LiveCache | undefined): DonkiSnapshot | null {
  if (!cache) return null;
  try {
    const raw = cache.read();
    if (!raw) return null;
    const snap = JSON.parse(raw) as DonkiSnapshot;
    if (!snap || !Array.isArray(snap.FLR) || !Array.isArray(snap.SEP)) return null;
    if (typeof snap.fetched_at !== 'string' || !snap.window?.start || !snap.window?.end) return null;
    return snap;
  } catch {
    return null;
  }
}

/** Saved data for "Today's Sun": the last good live download, else the newest snapshot. */
async function loadSaved(opts: RecentOptions, reason: string, cancelled: boolean): Promise<Loaded> {
  const cached = readCachedLive(opts.cache);
  if (cached) return { snapshot: cached, status: { ...archivedStatus(cached, reason), origin: 'cache', cancelled } };
  const saved = await loadLatestSnapshot(opts.fetchImpl, opts.base ?? SNAPSHOT_BASE);
  return { snapshot: saved.snapshot, status: { ...archivedStatus(saved.snapshot, reason), cancelled } };
}

/**
 * "Today's Sun": the last 30 days, live if possible.
 * Order of preference: new CCMC endpoint, api.nasa.gov, last good live
 * download, newest snapshot. FLR and SEP are requested in parallel and each
 * endpoint gets `timeoutMs`. The second endpoint is asked as soon as the first
 * fails (or after `hedgeMs`), so the whole wait stays under about 5 seconds.
 * If DONKI's flare list fails on an endpoint that otherwise works, its flare
 * alerts (class M5.0 and bigger) are used and the result says so.
 */
export async function loadRecent(opts: RecentOptions): Promise<Loaded> {
  const { fetchImpl, now, days = 30, timeoutMs = 4000, hedgeMs = 600, apiKey = 'DEMO_KEY', signal } = opts;
  const end = now.toISOString().slice(0, 10);
  const start = addDays(end, -(days - 1));
  const range = `startDate=${start}&endDate=${end}`;
  const endpoints = [
    { name: DONKI_NEW, url: (kind: string) => `${DONKI_NEW}/${kind}?${range}` },
    { name: DONKI_OLD, url: (kind: string) => `${DONKI_OLD}/${kind}?${range}&api_key=${encodeURIComponent(apiKey)}` },
  ];

  type Attempt = { ok: true; snapshot: DonkiSnapshot } | { ok: false; problem: string };
  const attempt = async (ep: (typeof endpoints)[number]): Promise<Attempt> => {
    try {
      // The flare alerts are asked for at the same time, as a backup for the flare list.
      const alerts = getArray(fetchImpl, `${ep.url('notifications')}&type=FLR`, timeoutMs, signal);
      const cmes = getArray(fetchImpl, ep.url('CME'), timeoutMs, signal).catch(() => []);
      alerts.catch(() => {});
      const [flr, sep] = await Promise.allSettled([
        getArray(fetchImpl, ep.url('FLR'), timeoutMs, signal),
        getArray(fetchImpl, ep.url('SEP'), timeoutMs, signal),
      ]);
      if (sep.status === 'rejected') throw sep.reason;
      const base = {
        window: { id: 'recent', title: "Today's Sun", kind: 'recent' as const, start, end },
        fetched_at: now.toISOString(),
        source: ep.name,
        source_endpoint: ep.name,
        SEP: sep.value as DonkiSep[],
      };
      if (flr.status === 'fulfilled') return { ok: true, snapshot: { ...base, flare_source: 'FLR', FLR: flr.value as DonkiFlare[] } };
      // The flare list failed but the rest of DONKI answered: use the flare alerts.
      let fromAlerts: DonkiFlare[];
      try {
        fromAlerts = flaresFromNotifications((await alerts) as DonkiNotification[], (await cmes) as DonkiCme[]);
      } catch {
        throw flr.reason;
      }
      return {
        ok: true,
        snapshot: { ...base, flare_source: 'notifications', flr_problem: problemText(flr.reason), partial: true, FLR: fromAlerts },
      };
    } catch (err) {
      return { ok: false, problem: `${ep.name}: ${problemText(err)}` };
    }
  };

  const live = async (): Promise<Attempt[]> => {
    const first = attempt(endpoints[0]);
    const firstDone = await Promise.race([first.then(() => true), sleep(hedgeMs).then(() => false)]);
    if (firstDone) {
      const r1 = await first;
      return r1.ok ? [r1] : [r1, await attempt(endpoints[1])];
    }
    // The first endpoint is slow. Ask the second one too and take whichever
    // gives good data first; if both fail, report both problems.
    const second = attempt(endpoints[1]);
    const winner = await Promise.race([
      first.then((r) => (r.ok ? r : second)),
      second.then((r) => (r.ok ? r : first)),
    ]);
    if (winner.ok) return [winner];
    return [await first, await second];
  };

  const cancelled = new Promise<'cancelled'>((resolve) => {
    if (!signal) return;
    if (signal.aborted) resolve('cancelled');
    else signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
  });

  const result = await Promise.race([live(), cancelled]);
  if (result === 'cancelled') return loadSaved(opts, 'the wait was skipped', true);

  const good = result.find((r) => r.ok);
  if (good && good.ok) {
    try {
      opts.cache?.write(JSON.stringify(good.snapshot));
    } catch {
      // A full or blocked cache must never stop the mission.
    }
    const snap = good.snapshot;
    return {
      snapshot: snap,
      status: {
        kind: 'live',
        origin: 'live',
        fetchedAt: snap.fetched_at,
        dataStart: start,
        dataEnd: end,
        source: snap.source,
        partial: Boolean(snap.partial),
        flareSource: snap.flare_source,
        reason: snap.flr_problem ? `flare list: ${snap.flr_problem}` : undefined,
      },
    };
  }
  const problems = result.map((r) => (r.ok ? '' : r.problem)).join('; ');
  return loadSaved(opts, problems, false);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** The badge text. LIVE and ARCHIVED can never be mixed up. */
export function badgeText(status: DataStatus): string {
  if (status.kind === 'live') {
    const t = new Date(status.fetchedAt);
    const hh = String(t.getUTCHours()).padStart(2, '0');
    const mm = String(t.getUTCMinutes()).padStart(2, '0');
    return `LIVE · fetched ${niceDay(status.fetchedAt)} ${hh}:${mm} UTC`;
  }
  if (status.origin === 'cache') return `ARCHIVED DATA · fetched ${niceDay(status.fetchedAt)}`;
  return `ARCHIVED DATA · from ${dataRangeText(status)}`;
}

/** "May 2024" or "3 Sep 2017 – 2 Oct 2017". */
function dataRangeText(status: DataStatus): string {
  return status.dataStart.slice(0, 7) === status.dataEnd.slice(0, 7)
      ? `${MONTHS[Number(status.dataEnd.slice(5, 7)) - 1]} ${status.dataEnd.slice(0, 4)}`
      : `${niceDay(status.dataStart)} – ${niceDay(status.dataEnd)}`;
}

/** Plain words for "the flares come from NASA's alerts, so small flares are missing". */
export function flareAlertNotice(status: DataStatus): string | null {
  if (status.flareSource !== 'notifications') return null;
  return `NASA's full flare list is not working right now, so this mission uses NASA's flare alerts. They only cover big flares (class ${NOTIFICATION_THRESHOLD} and up).`;
}

/**
 * The plain-words notice for the first morning report when "Today's Sun"
 * could not get live data. null when the data is live.
 */
export function fallbackNotice(status: DataStatus): string | null {
  if (status.kind === 'live') return null;
  const date = status.origin === 'cache' ? niceDay(status.fetchedAt) : dataRangeText(status);
  const why = status.cancelled ? 'You skipped the wait' : "NASA's server didn't answer right now";
  return `${why}, so this mission uses saved Sun data from ${date}.`;
}
