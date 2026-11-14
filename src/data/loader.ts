import type { DonkiFlare, DonkiSep } from './donki-mapping';
import { addDays } from './donki-mapping';
import type { DonkiSnapshot } from './scenarios';

// Data loading with an honest fallback chain for "Today's Sun":
//   1. new DONKI endpoint (CCMC, no key)
//   2. old DONKI endpoint (api.nasa.gov, DEMO_KEY)
//   3. the newest saved snapshot
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
  /** When the data was downloaded from DONKI (ISO). */
  fetchedAt: string;
  /** First and last day of data (YYYY-MM-DD). */
  dataStart: string;
  dataEnd: string;
  source: string;
  partial: boolean;
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

async function getArray(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<unknown[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseDonkiArray(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

export function archivedStatus(snapshot: DonkiSnapshot, reason?: string): DataStatus {
  return {
    kind: 'archived',
    fetchedAt: snapshot.fetched_at,
    dataStart: snapshot.window.start,
    dataEnd: snapshot.window.end,
    source: snapshot.source,
    partial: Boolean((snapshot as DonkiSnapshot & { partial?: boolean }).partial),
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

export interface RecentOptions {
  fetchImpl: FetchLike;
  now: Date;
  days?: number;
  timeoutMs?: number;
  base?: string;
}

/** "Today's Sun": the last 30 days, live if possible. */
export async function loadRecent(opts: RecentOptions): Promise<Loaded> {
  const { fetchImpl, now, days = 30, timeoutMs = 8000, base = SNAPSHOT_BASE } = opts;
  const end = now.toISOString().slice(0, 10);
  const start = addDays(end, -(days - 1));
  const range = `startDate=${start}&endDate=${end}`;
  const endpoints = [
    { name: DONKI_NEW, url: (kind: string) => `${DONKI_NEW}/${kind}?${range}` },
    { name: DONKI_OLD, url: (kind: string) => `${DONKI_OLD}/${kind}?${range}&api_key=DEMO_KEY` },
  ];

  const problems: string[] = [];
  for (const ep of endpoints) {
    try {
      const [flr, sep] = await Promise.all([
        getArray(fetchImpl, ep.url('FLR'), timeoutMs),
        getArray(fetchImpl, ep.url('SEP'), timeoutMs),
      ]);
      const snapshot: DonkiSnapshot = {
        window: { id: 'recent', title: "Today's Sun", kind: 'recent', start, end },
        fetched_at: now.toISOString(),
        source: ep.name,
        FLR: flr as DonkiFlare[],
        SEP: sep as DonkiSep[],
      };
      return {
        snapshot,
        status: { kind: 'live', fetchedAt: snapshot.fetched_at, dataStart: start, dataEnd: end, source: ep.name, partial: false },
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      problems.push(`${ep.name}: ${aborted ? 'no answer in time' : err instanceof Error ? err.message : String(err)}`);
    }
  }

  const saved = await loadLatestSnapshot(fetchImpl, base);
  return { snapshot: saved.snapshot, status: archivedStatus(saved.snapshot, problems.join('; ')) };
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
  const range =
    status.dataStart.slice(0, 7) === status.dataEnd.slice(0, 7)
      ? `${MONTHS[Number(status.dataEnd.slice(5, 7)) - 1]} ${status.dataEnd.slice(0, 4)}`
      : `${niceDay(status.dataStart)} – ${niceDay(status.dataEnd)}`;
  return `ARCHIVED DATA · from ${range}`;
}
