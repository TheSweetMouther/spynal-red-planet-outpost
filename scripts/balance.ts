// Balance check: plays the pure simulation many times per strategy and checks
// the section 7 criteria. Run with: npm run balance
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../src/sim/config';
import { randomScenario } from '../src/sim/events';
import { playMission } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import type { FailReason, Scenario } from '../src/sim/state';
import { scenarioFromSnapshot, type DonkiSnapshot } from '../src/data/scenarios';

const RUNS = Number(process.env.RUNS ?? 1000);

interface Row {
  id: string;
  label: string;
  fixed: boolean;
  wins: number;
  fails: Record<FailReason, number>;
}

function run(makeScenario: (seed: number) => Scenario): Row[] {
  return STRATEGIES.map((s) => {
    const row: Row = { id: s.id, label: s.label, fixed: s.fixed, wins: 0, fails: { life: 0, radiation: 0, science: 0 } };
    for (let i = 0; i < RUNS; i++) {
      const seed = 1000 + i * 7919;
      const end = playMission(makeScenario(seed), seed, s.make(seed));
      if (end.status === 'won') row.wins++;
      else row.fails[end.failReason!]++;
    }
    return row;
  });
}

const pct = (n: number) => `${((100 * n) / RUNS).toFixed(1)}%`.padStart(7);

function print(title: string, rows: Row[]) {
  console.log(`\n${title}  (${RUNS} runs per strategy)`);
  console.log('Strategy'.padEnd(32) + '    Win' + '  Fail:life' + '  Fail:dose' + '  Fail:science');
  for (const r of rows)
    console.log(
      r.label.padEnd(32) + pct(r.wins) + '   ' + pct(r.fails.life) + '    ' + pct(r.fails.radiation) + '       ' + pct(r.fails.science),
    );
}

function check(rows: Row[]): { name: string; ok: boolean }[] {
  const get = (id: string) => rows.find((r) => r.id === id)!;
  const fixed = rows.filter((r) => r.fixed);
  const bestFixed = Math.max(...fixed.map((r) => r.wins));
  const safety = get('safety');
  const science = get('science');
  const adaptive = get('adaptive');
  const safetyLosses = RUNS - safety.wins;
  const scienceLosses = RUNS - science.wins;
  return [
    { name: 'No fixed strategy wins more than 80%', ok: bestFixed / RUNS <= 0.8 },
    { name: 'All-in Safety fails mostly on the science goal', ok: safetyLosses > 0 && safety.fails.science / safetyLosses > 0.5 },
    {
      name: 'All-in Science fails mostly on dose or life support',
      ok: scienceLosses > 0 && (science.fails.radiation + science.fails.life) / scienceLosses > 0.5,
    },
    {
      name: 'Adaptive wins clearly more than any fixed strategy (+15 points)',
      ok: (adaptive.wins - bestFixed) / RUNS >= 0.15,
    },
  ];
}

console.log(`Config: goal ${CONFIG.scienceGoal} samples, dose limit ${CONFIG.doseLimit}, base dose ${CONFIG.baseDose}/sol`);

const randomRows = run((seed) => randomScenario(seed));
print('RANDOM MISSIONS', randomRows);
const checks = check(randomRows);
console.log('\nPass criteria (random missions):');
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);

// Replay missions: reported for information; the storms are fixed by real data.
const dir = join(process.cwd(), 'public', 'data', 'donki');
if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    const snap = JSON.parse(readFileSync(join(dir, file), 'utf8')) as DonkiSnapshot;
    if (!snap.window || snap.window.kind !== 'replay') continue;
    print(`REPLAY: ${snap.window.title}`, run((seed) => scenarioFromSnapshot(snap, seed)));
  }
}

const allOk = checks.every((c) => c.ok);
console.log(allOk ? '\nBALANCE OK' : '\nBALANCE FAILED');
process.exit(allOk ? 0 : 1);
