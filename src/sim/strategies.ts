import { CONFIG } from './config';
import { makeRng } from './rng';
import { emptyAllocation, stormDoseOf, SYSTEMS, type Allocation, type MorningView, type SystemId } from './state';
import { batteryAfterAllocation } from './step';

// Robot players used by scripts/balance.ts and the tests. They only see the
// MorningView, exactly what a human player sees.

export type Strategy = (view: MorningView) => Allocation;

/** Spend every available cell following a fixed priority list. */
function byPriority(order: SystemId[], repeat: SystemId[]): Strategy {
  return (view) => {
    const a = emptyAllocation();
    for (let i = 0; i < view.available; i++) {
      const sys = i < order.length ? order[i] : repeat[(i - order.length) % repeat.length];
      a[sys]++;
    }
    return a;
  };
}

/** Life Support minimum, everything else into Science. */
export const allScience: Strategy = byPriority(['life', 'life', 'life'], ['science']);

/** Life Support and Shielding only. Never does science. */
export const allSafety: Strategy = byPriority(
  ['life', 'life', 'life', 'shield', 'shield', 'shield', 'shield'],
  ['life'],
);

/** The same even split every sol, whatever happens. */
export const balanced: Strategy = byPriority(
  ['life', 'life', 'life', 'science', 'shield', 'comms', 'science', 'shield'],
  ['science', 'shield'],
);

/** Always funds Comms heavily but never reacts to what it hears. */
export const commsFirst: Strategy = byPriority(
  ['comms', 'comms', 'life', 'life', 'life', 'science', 'shield', 'science'],
  ['shield', 'science'],
);

export function randomStrategy(seed: number): Strategy {
  const rng = makeRng(seed);
  return (view) => {
    const a = emptyAllocation();
    const spend = rng.int(0, view.available);
    for (let i = 0; i < spend; i++) a[rng.pick(SYSTEMS)]++;
    return a;
  };
}

/**
 * A sensible player: buys the forecast, shelters and cancels outside work when
 * a storm is coming, does science on calm sols, and saves battery before dust.
 */
export const adaptive: Strategy = (view) => {
  const a = emptyAllocation();
  let left = view.available;
  const put = (sys: SystemId, n: number) => {
    const k = Math.max(0, Math.min(n, left));
    a[sys] += k;
    left -= k;
  };
  const lastSol = view.sol >= view.solsTotal;
  const solsLeft = view.solsTotal - view.sol + 1;
  const scienceNeeded = Math.max(0, CONFIG.scienceGoal - view.science);
  const doseRoom = CONFIG.doseLimit - view.dose;

  put('life', CONFIG.lifeNeed + (view.life < 60 ? 1 : 0));
  // On a storm sol the shelter comes before everything except Life Support.
  const storm = view.hasForecast ? view.stormToday : undefined;
  if (storm) put('shield', storm.severity === 'minor' && !storm.sep ? 1 : CONFIG.shieldMaxCells);
  else if (!view.hasForecast) put('shield', 1); // flying blind: play it safer
  if (!lastSol) put('comms', 1);

  // Keep cells in the battery for the heaters when dust is here or coming.
  const keep = lastSol ? 0 : view.dust || view.dustTomorrow ? 2 : 0;
  const batteryIf = (science: number) =>
    batteryAfterAllocation(view.solar, view.battery, view.available - left + science).after;

  // Science with what is left. On a storm sol, working outside costs a lot of
  // dose, so stay in unless the storm is small or the goal is slipping away.
  const stormDose = stormDoseOf(storm ?? null);
  const costPerCell = CONFIG.evaDose + CONFIG.evaStormShare * stormDose;
  const habitatToday = CONFIG.baseDose + stormDose * (1 - Math.min(a.shield, CONFIG.shieldMaxCells) * CONFIG.shieldPerCell);
  // Never spend dose the rest of the mission will need.
  const affordable = Math.floor((doseRoom - habitatToday - (solsLeft - 1) * CONFIG.baseDose - 15) / costPerCell);
  if (scienceNeeded > 0 && costPerCell <= CONFIG.evaDose * 2.5) {
    let s = Math.max(0, Math.min(left, scienceNeeded, affordable));
    while (s > 0 && batteryIf(s) < keep) s--;
    put('science', s);
  }
  // Spare cells charge the battery. Only what would overflow goes to the shield.
  while (left > 0 && a.shield < CONFIG.shieldMaxCells) {
    const before = batteryIf(0);
    a.shield++;
    left--;
    if (batteryIf(0) < before) {
      a.shield--;
      left++;
      break;
    }
  }
  return a;
};

/** Rushes science with no Comms and no shield, then hides once the goal is met. Never reacts to warnings. */
export const rushThenHide: Strategy = (view) =>
  view.science < CONFIG.scienceGoal
    ? allScience(view)
    : byPriority(['life', 'life', 'life', 'shield', 'shield', 'shield', 'shield'], ['life'])(view);

/** The same plan every sol: Life Support 3, a set Shielding and Comms, the rest to Science. */
export function fixedPlan(shield: number, comms: number): Strategy {
  const order: SystemId[] = ['life', 'life', 'life'];
  for (let i = 0; i < comms; i++) order.push('comms');
  for (let i = 0; i < shield; i++) order.push('shield');
  return byPriority(order, ['science']);
}

const FIXED_PLANS = [1, 2, 3, 4].flatMap((shield) =>
  [0, 1].map((comms) => ({
    id: `fixed-s${shield}-c${comms}`,
    label: `Fixed: shield ${shield}, ${comms ? 'comms 1' : 'no comms'}, rest science`,
    fixed: true,
    make: () => fixedPlan(shield, comms),
  })),
);

export const STRATEGIES: { id: string; label: string; fixed: boolean; make: (seed: number) => Strategy }[] = [
  { id: 'science', label: 'All-in Science', fixed: true, make: () => allScience },
  { id: 'safety', label: 'All-in Safety', fixed: true, make: () => allSafety },
  { id: 'balanced', label: 'Balanced (fixed)', fixed: true, make: () => balanced },
  { id: 'comms', label: 'Comms-first (fixed)', fixed: true, make: () => commsFirst },
  { id: 'rush', label: 'Rush science, then hide (no comms)', fixed: true, make: () => rushThenHide },
  ...FIXED_PLANS,
  { id: 'random', label: 'Random', fixed: false, make: (seed) => randomStrategy(seed) },
  { id: 'adaptive', label: 'Adaptive (reacts to warnings)', fixed: false, make: () => adaptive },
];
