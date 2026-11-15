// Balance check: plays the pure simulation many times per strategy, for the
// Random mission and for every replay mission, and checks the balance rules.
// Run with: npm run balance
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../src/sim/config';
import { randomScenario } from '../src/sim/events';
import { playMission } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import type { FailReason, Scenario } from '../src/sim/state';
import { scenarioFromSnapshot, startDateFor, type DonkiSnapshot } from '../src/data/scenarios';

const RUNS = Number(process.env.RUNS ?? 1000);
/** No fixed strategy may win more often than this. */
const MAX_FIXED = 0.6;
/** The adaptive player must beat the best fixed one by at least this much. */
const MIN_GAP = 0.15;
/** Winning adaptive runs should reach the goal on this sol or later (median). */
const MIN_GOAL_SOL = 8;

interface Row {
  id: string;
  label: string;
  fixed: boolean;
  wins: number;
  fails: Record<FailReason, number>;
  /** Sol on which each winning run first reached the science goal. */
  goalSols: number[];
}

function run(makeScenario: (seed: number) => Scenario): Row[] {
  return STRATEGIES.map((s) => {
    const row: Row = { id: s.id, label: s.label, fixed: s.fixed, wins: 0, fails: { life: 0, radiation: 0, science: 0 }, goalSols: [] };
    for (let i = 0; i < RUNS; i++) {
      const seed = 1000 + i * 7919;
      const end = playMission(makeScenario(seed), seed, s.make(seed));
      if (end.status === 'won') {
        row.wins++;
        const hit = end.history.find((r) => r.scienceAfter >= CONFIG.scienceGoal);
        if (hit) row.goalSols.push(hit.sol);
      } else row.fails[end.failReason!]++;
    }
    return row;
  });
}

const pct = (n: number) => `${((100 * n) / RUNS).toFixed(1)}%`.padStart(7);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

function print(title: string, rows: Row[]) {
  console.log(`\n${title}  (${RUNS} runs per strategy)`);
  console.log('Strategy'.padEnd(40) + '    Win' + '  Fail:life' + '  Fail:dose' + '  Fail:science' + '  Goal sol (median)');
  for (const r of rows)
    console.log(
      r.label.padEnd(40) +
        pct(r.wins) +
        '   ' +
        pct(r.fails.life) +
        '    ' +
        pct(r.fails.radiation) +
        '       ' +
        pct(r.fails.science) +
        '      ' +
        (r.goalSols.length ? String(median(r.goalSols)) : '-'),
    );
}

function check(rows: Row[]): { name: string; ok: boolean }[] {
  const get = (id: string) => rows.find((r) => r.id === id)!;
  const fixed = rows.filter((r) => r.fixed);
  const best = fixed.reduce((a, b) => (b.wins > a.wins ? b : a));
  const safety = get('safety');
  const science = get('science');
  const adaptive = get('adaptive');
  const safetyLosses = RUNS - safety.wins;
  const scienceLosses = RUNS - science.wins;
  const goalSol = median(adaptive.goalSols);
  return [
    {
      name: `No fixed strategy wins more than ${MAX_FIXED * 100}% (best: ${best.label}, ${pct(best.wins).trim()})`,
      ok: best.wins / RUNS <= MAX_FIXED,
    },
    { name: 'All-in Safety fails mostly on the science goal', ok: safetyLosses > 0 && safety.fails.science / safetyLosses > 0.5 },
    {
      name: 'All-in Science fails mostly on dose or life support',
      ok: scienceLosses > 0 && (science.fails.radiation + science.fails.life) / scienceLosses > 0.5,
    },
    {
      name: `Adaptive beats every fixed strategy by ${MIN_GAP * 100}+ points (${pct(adaptive.wins).trim()} vs ${pct(best.wins).trim()})`,
      ok: (adaptive.wins - best.wins) / RUNS >= MIN_GAP,
    },
    {
      name: `Winning adaptive runs reach the goal on sol ${MIN_GOAL_SOL} or later (median sol ${goalSol})`,
      ok: goalSol >= MIN_GOAL_SOL,
    },
  ];
}

console.log(`Config: goal ${CONFIG.scienceGoal} samples, dose limit ${CONFIG.doseLimit}, base dose ${CONFIG.baseDose}/sol`);

let allOk = true;
function mission(title: string, makeScenario: (seed: number) => Scenario) {
  const rows = run(makeScenario);
  print(title, rows);
  for (const c of check(rows)) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    if (!c.ok) allOk = false;
  }
}

mission('RANDOM MISSIONS', (seed) => randomScenario(seed));

// Replay missions: the storms are fixed by real data. The seed slides the
// start day inside the window and moves the dust storm, so 1,000 seeds cover
// every start-day offset.
const dir = join(process.cwd(), 'public', 'data', 'donki');
if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    const snap = JSON.parse(readFileSync(join(dir, file), 'utf8')) as DonkiSnapshot;
    if (!snap.window || snap.window.kind !== 'replay') continue;
    const offsets = new Set<string>();
    for (let i = 0; i < RUNS; i++) offsets.add(startDateFor(snap, 1000 + i * 7919));
    mission(`REPLAY: ${snap.window.title} (${offsets.size} start days: ${[...offsets].sort().join(', ')})`, (seed) =>
      scenarioFromSnapshot(snap, seed),
    );
  }
}

console.log(allOk ? '\nBALANCE OK' : '\nBALANCE FAILED');
process.exit(allOk ? 0 : 1);
