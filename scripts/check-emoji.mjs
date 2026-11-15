// Checks that the screens contain no emoji (icons are bundled Phosphor SVGs).
// Run with: node scripts/check-emoji.mjs
// src/sim is not scanned: its night notes carry an emoji `icon` field that the
// UI never shows (it maps the note to a Phosphor icon instead).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Emoji and pictograph blocks, dingbats, misc symbols, arrows, stars, variation selector 16.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}\u{203C}\u{2049}]/u;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = [...walk('src/ui'), 'src/main.tsx', 'index.html'];
let found = 0;
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = EMOJI.exec(line);
      if (m) {
        found++;
        console.log(`${file}:${i + 1}: U+${m[0].codePointAt(0).toString(16).toUpperCase()}  ${line.trim().slice(0, 90)}`);
      }
    });
}
console.log(found ? `\n${found} lines with emoji or symbol characters` : `No emoji in ${files.length} files`);
process.exit(found ? 1 : 0);
