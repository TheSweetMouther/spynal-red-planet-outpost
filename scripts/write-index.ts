// Writes public/data/donki/index.json: the list of saved snapshots the app can load.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function writeIndex(dir: string) {
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((file) => {
      const s = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      return {
        id: s.window.id,
        file,
        kind: s.window.kind,
        title: s.window.title,
        start: s.window.start,
        end: s.window.end,
        fetched_at: s.fetched_at,
        marsObserved: s.window.marsObserved,
        blurb: s.window.blurb,
        partial: Boolean(s.partial),
        flares: s.FLR.length,
        particleEvents: s.SEP.length,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  writeFileSync(join(dir, 'index.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`index.json: ${entries.map((e) => e.id).join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeIndex(join(process.cwd(), 'public', 'data', 'donki'));
}
