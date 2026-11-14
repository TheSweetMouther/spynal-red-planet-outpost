// Backup importer: builds replay snapshots from Internet Archive captures of
// DONKI's own event pages (kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR|SEP/<id>).
//
// Use this only when the DONKI API is unreachable (it was on 2026-11-14).
// The records are real DONKI records, but the archive did not capture every
// flare, so these snapshots are marked `partial: true`.
//
// Run with: npm run import-wayback
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WINDOWS } from './windows';
import { writeIndex } from './write-index';

const CACHE = join(process.cwd(), '.cache', 'wayback');
const OUT = join(process.cwd(), 'public', 'data', 'donki');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

interface Capture {
  kind: 'FLR' | 'SEP';
  id: number;
  version: number;
  timestamp: string;
  url: string;
}

async function getText(url: string, tries = 4): Promise<string> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (res.ok) return await res.text();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`Could not fetch ${url}`);
}

async function listCaptures(kind: 'FLR' | 'SEP'): Promise<Capture[]> {
  const cdx =
    `https://web.archive.org/cdx/search/cdx?url=kauai.ccmc.gsfc.nasa.gov/DONKI/view/${kind}/` +
    `&matchType=prefix&output=txt&limit=5000&filter=statuscode:200&fl=timestamp,original&collapse=urlkey`;
  const text = await getText(cdx);
  const out: Capture[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^(\d{14}) (\S*\/view\/[A-Z]+\/(\d+)\/(\d+))\s*$/);
    if (m) out.push({ kind, timestamp: m[1], url: m[2], id: Number(m[3]), version: Number(m[4]) });
  }
  return out;
}

async function page(c: Capture): Promise<string> {
  const file = join(CACHE, `${c.kind}_${c.id}_${c.version}.html`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const html = await getText(`https://web.archive.org/web/${c.timestamp}id_/${c.url}`);
  writeFileSync(file, html);
  return html;
}

const clean = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');

interface Linked {
  activityID: string;
  /** Extra text DONKI shows beside the link, e.g. "FLR Type: M5.5". */
  detail?: string;
}

function parseLinked(html: string): Linked[] {
  const at = html.indexOf('All directly linked activities');
  if (at < 0) return [];
  const tail = html.slice(at, html.indexOf('Comments by users', at) > 0 ? html.indexOf('Comments by users', at) : undefined);
  const out: Linked[] = [];
  const re = /<a\s+href="\s*\/DONKI\/view\/[A-Z]+\/\d+\/\d+\s*"\s*>\s*([^<\s]+)\s*<\/a>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail))) {
    const detail = m[2].replace(/\s+/g, ' ').trim();
    out.push(detail ? { activityID: m[1], detail } : { activityID: m[1] });
  }
  return out;
}

const archiveUrl = (c: Capture) => `https://web.archive.org/web/${c.timestamp}/${c.url}`;
const isoStamp = (t: string) => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}Z`;

function parseFlare(c: Capture, html: string) {
  const t = clean(html);
  const id = t.match(/Activity ID: (\S+)/)?.[1];
  const cls = t.match(/Intensity: (\S+) class/)?.[1];
  if (!id || !cls) return null;
  const region = t.match(/Source region (\S+) \((\d+)\)/);
  return {
    flrID: id,
    beginTime: t.match(/Start Time: (\S+)/)?.[1],
    peakTime: t.match(/Peak Time: (\S+)/)?.[1],
    endTime: t.match(/End Time: (\S+)/)?.[1],
    classType: cls,
    sourceLocation: region?.[1],
    activeRegionNum: region ? Number(region[2]) : undefined,
    linkedEvents: parseLinked(html),
    link: archiveUrl(c),
    archived_at: isoStamp(c.timestamp),
  };
}

function parseSep(c: Capture, html: string) {
  const t = clean(html);
  const id = t.match(/Activity ID: (\S+)/)?.[1];
  const ev = t.match(/Event Time: (\S+) \( ([^)]*?) \)/);
  if (!id || !ev) return null;
  return {
    sepID: id,
    eventTime: ev[1],
    instrument: ev[2].trim(),
    linkedEvents: parseLinked(html),
    link: archiveUrl(c),
    archived_at: isoStamp(c.timestamp),
  };
}

const inWindow = (iso: string | undefined, start: string, end: string) =>
  Boolean(iso) && iso!.slice(0, 10) >= start && iso!.slice(0, 10) <= end;

async function main() {
  const captures = [...(await listCaptures('FLR')), ...(await listCaptures('SEP'))];
  console.log(`Found ${captures.length} archived DONKI event pages.`);

  for (const w of WINDOWS) {
    // newest version of each page inside the window's ID range
    const byKey = new Map<string, Capture>();
    for (const c of captures) {
      if (c.id < w.viewIds[0] || c.id > w.viewIds[1]) continue;
      const key = `${c.kind}/${c.id}`;
      const prev = byKey.get(key);
      if (!prev || c.version > prev.version) byKey.set(key, c);
    }
    const FLR: NonNullable<ReturnType<typeof parseFlare>>[] = [];
    const SEP: NonNullable<ReturnType<typeof parseSep>>[] = [];
    for (const c of byKey.values()) {
      const html = await page(c);
      if (c.kind === 'FLR') {
        const f = parseFlare(c, html);
        if (f && inWindow(f.peakTime ?? f.beginTime, w.start, w.end)) FLR.push(f);
      } else {
        const s = parseSep(c, html);
        if (s && inWindow(s.eventTime, w.start, w.end)) SEP.push(s);
      }
    }

    // Flares that DONKI lists as linked on a particle-event page, but whose own
    // page was not archived. The class comes from the "FLR Type" text there.
    for (const s of SEP) {
      for (const l of s.linkedEvents) {
        const cls = l.detail?.match(/FLR Type: (\S+)/)?.[1];
        if (!cls || !l.activityID.includes('-FLR-')) continue;
        if (FLR.some((f) => f.flrID === l.activityID)) continue;
        const begin = l.activityID.slice(0, 16) + 'Z';
        if (!inWindow(begin, w.start, w.end)) continue;
        FLR.push({
          flrID: l.activityID,
          beginTime: begin,
          peakTime: undefined,
          endTime: undefined,
          classType: cls,
          sourceLocation: undefined,
          activeRegionNum: undefined,
          linkedEvents: [{ activityID: s.sepID }],
          link: s.link,
          archived_at: s.archived_at,
        });
      }
    }

    FLR.sort((a, b) => (a.beginTime ?? '').localeCompare(b.beginTime ?? ''));
    SEP.sort((a, b) => a.eventTime.localeCompare(b.eventTime));
    const snapshot = {
      window: { id: w.id, title: w.title, kind: 'replay', start: w.start, end: w.end, marsObserved: w.marsObserved, blurb: w.blurb },
      fetched_at: new Date().toISOString(),
      source: 'Internet Archive captures of DONKI event pages (kauai.ccmc.gsfc.nasa.gov/DONKI/view)',
      partial: true,
      note:
        'The DONKI API was unreachable when this was built, so these records were read from archived copies of ' +
        "DONKI's own event pages. Only flares and particle events that the archive captured are included.",
      FLR,
      SEP,
    };
    writeFileSync(join(OUT, `${w.id}.json`), JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`${w.id}: ${FLR.length} flares, ${SEP.length} particle events`);
    for (const f of FLR) console.log(`   ${f.peakTime ?? f.beginTime}  ${f.classType.padEnd(5)} ${f.flrID}  links: ${f.linkedEvents.map((l) => l.activityID.slice(-7)).join(',')}`);
    for (const s of SEP) console.log(`   SEP ${s.eventTime}  ${s.instrument}`);
  }
  writeIndex(OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
