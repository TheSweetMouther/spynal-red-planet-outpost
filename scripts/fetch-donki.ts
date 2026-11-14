// Downloads DONKI flare (FLR) and particle-event (SEP) data and saves snapshots
// to public/data/donki/*.json with a fetched_at timestamp.
//
// Tries the new CCMC endpoint first, then the old api.nasa.gov one.
// Set NASA_API_KEY to use your own key on the old endpoint (default DEMO_KEY).
// If both are down, existing snapshots are left untouched; see
// scripts/import-wayback-donki.ts for the archive-based backup.
//
// Run with: npm run fetch-donki
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDonkiArray } from '../src/data/loader';
import { addDays } from '../src/data/donki-mapping';
import { DONKI_NEW, DONKI_OLD, WINDOWS } from './windows';
import { writeIndex } from './write-index';

const OUT = join(process.cwd(), 'public', 'data', 'donki');
mkdirSync(OUT, { recursive: true });
const KEY = process.env.NASA_API_KEY ?? 'DEMO_KEY';

async function get(url: string): Promise<unknown[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) throw new Error(`HTTP ${res.status} redirect to ${res.headers.get('location')}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseDonkiArray(await res.text());
}

async function fetchRange(start: string, end: string) {
  const range = `startDate=${start}&endDate=${end}`;
  const tries = [
    { source: DONKI_NEW, url: (k: string) => `${DONKI_NEW}/${k}?${range}` },
    { source: DONKI_OLD, url: (k: string) => `${DONKI_OLD}/${k}?${range}&api_key=${KEY}` },
  ];
  const errors: string[] = [];
  for (const t of tries) {
    try {
      const [FLR, SEP] = [await get(t.url('FLR')), await get(t.url('SEP'))];
      return { source: t.source, FLR, SEP };
    } catch (e) {
      errors.push(`${t.source}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw new Error(errors.join('\n  '));
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
    try {
      const data = await fetchRange(job.window.start, job.window.end);
      const snapshot = { window: job.window, fetched_at: new Date().toISOString(), source: data.source, FLR: data.FLR, SEP: data.SEP };
      writeFileSync(join(OUT, `${job.window.id}.json`), JSON.stringify(snapshot, null, 2) + '\n');
      console.log(`OK   ${job.window.id}: ${data.FLR.length} flares, ${data.SEP.length} particle events from ${data.source}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${job.window.id} (kept any existing snapshot)\n  ${e instanceof Error ? e.message : e}`);
    }
  }
  writeIndex(OUT);
  if (failed) {
    console.error(`\n${failed} of ${jobs.length} downloads failed. If DONKI is down, try: npm run import-wayback`);
    process.exit(1);
  }
}

main();
