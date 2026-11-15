// Downloads DONKI flare (FLR) and particle-event (SEP) data and saves snapshots
// to public/data/donki/*.json with source_endpoint and fetched_at.
//
// Tries the new CCMC endpoint first, then api.nasa.gov. Each endpoint is
// retried on HTTP 429 / 503 with backoff (2 s, 5 s, 10 s) before moving on.
// The api.nasa.gov key is read from NASA_API_KEY (or VITE_NASA_API_KEY), from
// the environment or from .env / .env.local. Without one, DEMO_KEY is used,
// which is rate limited. The key is never printed in full and never saved.
// If both endpoints fail, existing snapshots are left untouched; see
// scripts/import-wayback-donki.ts for the archive-based backup.
//
// Run with: npm run fetch-donki
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDonkiArray } from '../src/data/loader';
import { addDays, type DonkiFlare } from '../src/data/donki-mapping';
import { flaresFromNotifications, mergeFlares, NOTIFICATION_THRESHOLD, type DonkiCme, type DonkiNotification } from '../src/data/donki-notifications';
import { DONKI_NEW, DONKI_OLD, WINDOWS } from './windows';
import { writeIndex } from './write-index';

const OUT = join(process.cwd(), 'public', 'data', 'donki');
mkdirSync(OUT, { recursive: true });

// Variables already in the environment win over the files.
for (const file of ['.env.local', '.env']) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;
  try {
    process.loadEnvFile(path);
  } catch (e) {
    console.warn(`Could not read ${file}: ${e instanceof Error ? e.message : e}`);
  }
}

/** First 4 characters only, so a log never leaks a key. */
export function maskKey(key: string | undefined): string {
  if (!key) return '(not set)';
  return `${key.slice(0, 4)}… (${key.length} characters)`;
}

const fromEnv = process.env.NASA_API_KEY || process.env.VITE_NASA_API_KEY;
const KEY = fromEnv || 'DEMO_KEY';
console.log(`NASA_API_KEY:      ${maskKey(process.env.NASA_API_KEY)}`);
console.log(`VITE_NASA_API_KEY: ${maskKey(process.env.VITE_NASA_API_KEY)}`);
console.log(`Key used for api.nasa.gov: source ${fromEnv ? 'env' : 'DEMO_KEY'}, starts ${KEY.slice(0, 4)}…\n`);

const BACKOFF_MS = [2000, 5000, 10000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getOnce(url: string): Promise<unknown[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) throw new Error(`HTTP ${res.status} redirect to ${res.headers.get('location')}`);
  if (!res.ok) throw new HttpError(res.status);
  return parseDonkiArray(await res.text());
}

/** One request, retried on 429 / 503. `label` never contains the key. */
async function get(url: string, label: string): Promise<unknown[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getOnce(url);
    } catch (e) {
      const retry = e instanceof HttpError && (e.status === 429 || e.status === 503) && attempt < BACKOFF_MS.length;
      if (!retry) throw e;
      console.log(`  ${label}: HTTP ${(e as HttpError).status}, retry in ${BACKOFF_MS[attempt] / 1000} s`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

async function fetchRange(start: string, end: string) {
  const range = `startDate=${start}&endDate=${end}`;
  const tries = [
    { source: DONKI_NEW, url: (k: string) => `${DONKI_NEW}/${k}?${range}` },
    { source: DONKI_OLD, url: (k: string) => `${DONKI_OLD}/${k}?${range}&api_key=${encodeURIComponent(KEY)}` },
  ];
  const errors: string[] = [];
  const text = (e: unknown) => {
    const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : '';
    return `${e instanceof Error ? e.message : e}${cause}`;
  };
  for (const t of tries) {
    try {
      const [flr, sep] = await Promise.allSettled([get(t.url('FLR'), `${t.source}/FLR`), get(t.url('SEP'), `${t.source}/SEP`)]);
      if (sep.status === 'rejected') throw new Error(`SEP ${text(sep.reason)}`);
      if (flr.status === 'fulfilled')
        return { source: t.source, flareSource: 'FLR' as const, flrProblem: undefined, FLR: flr.value as DonkiFlare[], SEP: sep.value };
      // The flare list is down but the rest of DONKI answers: build the flares
      // from DONKI's flare notifications (every flare of M5.0 and bigger).
      const flrProblem = text(flr.reason);
      console.log(`  ${t.source}/FLR failed (${flrProblem}); SEP is OK. Using flare notifications instead.`);
      const alerts = (await get(`${t.url('notifications')}&type=FLR`, `${t.source}/notifications`)) as DonkiNotification[];
      const cmes = (await get(t.url('CME'), `${t.source}/CME`).catch(() => [])) as DonkiCme[];
      return { source: t.source, flareSource: 'notifications' as const, flrProblem, FLR: flaresFromNotifications(alerts, cmes), SEP: sep.value };
    } catch (e) {
      errors.push(`${t.source}: ${text(e)}`);
    }
  }
  throw new Error(errors.join('\n  '));
}

function countsOf(file: string): string {
  if (!existsSync(file)) return 'no snapshot';
  try {
    const s = JSON.parse(readFileSync(file, 'utf8'));
    return `${s.FLR.length} FLR, ${s.SEP.length} SEP${s.partial ? ' (partial)' : ''}`;
  } catch {
    return 'unreadable snapshot';
  }
}

/** Flare records in an existing snapshot that were read from archived DONKI pages. */
function archivedFlares(file: string): DonkiFlare[] {
  if (!existsSync(file)) return [];
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as { FLR: (DonkiFlare & { archived_at?: string })[] };
    return s.FLR.filter((f) => f.archived_at);
  } catch {
    return [];
  }
}

async function main() {
  let failed = 0;
  const today = new Date().toISOString().slice(0, 10);
  const jobs = [
    ...WINDOWS.map((w) => ({
      window: { id: w.id, title: w.title, kind: 'replay' as const, start: w.start, end: w.end, marsObserved: w.marsObserved, blurb: w.blurb },
    })),
    { window: { id: 'recent', title: "Today's Sun", kind: 'recent' as const, start: addDays(today, -29), end: today } },
  ];
  for (const job of jobs) {
    const file = join(OUT, `${job.window.id}.json`);
    const before = countsOf(file);
    try {
      const data = await fetchRange(job.window.start, job.window.end);
      // A full flare list replaces everything. If only the notifications were
      // available, smaller flares already read from archived DONKI pages are kept.
      const archived = data.flareSource === 'notifications' ? archivedFlares(file) : [];
      const FLR = mergeFlares(archived, data.FLR);
      const fromArchive = archived.length;
      const snapshot = {
        window: job.window,
        fetched_at: new Date().toISOString(),
        source: 'NASA CCMC DONKI API',
        source_endpoint: data.source,
        flare_source: data.flareSource,
        flr_problem: data.flrProblem,
        partial: data.flareSource !== 'FLR',
        note:
          data.flareSource === 'FLR'
            ? 'Complete FLR and SEP download from the DONKI API.'
            : `SEP is a complete download from the DONKI API. The DONKI flare list (FLR) failed (${data.flrProblem}), so flares come from DONKI flare notifications, which cover every flare of class ${NOTIFICATION_THRESHOLD} and bigger` +
              (fromArchive ? `, plus ${fromArchive} flare records read earlier from Internet Archive copies of DONKI pages.` : '.') +
              ' Flares smaller than that may be missing.',
        flares_from_archive: fromArchive,
        FLR,
        SEP: data.SEP,
      };
      writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
      console.log(
        `OK   ${job.window.id}: before ${before}; after ${FLR.length} FLR (${data.flareSource}${fromArchive ? `, ${fromArchive} kept from archive` : ''}), ${data.SEP.length} SEP from ${data.source}`,
      );
    } catch (e) {
      failed++;
      console.error(`FAIL ${job.window.id} (kept existing: ${before})\n  ${e instanceof Error ? e.message : e}`);
    }
  }
  writeIndex(OUT);
  if (failed) {
    console.error(`\n${failed} of ${jobs.length} downloads failed. If DONKI is down, try: npm run import-wayback`);
    process.exit(1);
  }
}

main();
