import { CONFIG } from './config';
import { makeRng } from './rng';
import { emptyAllocation, SYSTEMS, type Allocation, type MorningView, type SystemId } from './state';

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
 * A sensible player: buys the forecast, shelters when a storm is coming,
 * does science on calm sols, and saves battery before dusty nights.
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
  if (!lastSol) put('comms', 1);

  // Keep cells back for the heaters when dust is here or coming.
  let reserve = 0;
  if (view.dust || view.dustTomorrow) reserve = Math.max(0, 2 - Math.max(0, view.battery - (view.available - left)));
  if (lastSol) reserve = 0;

  const storm = view.hasForecast ? view.stormToday : undefined;
  if (storm) {
    const want = storm.sep || storm.severity === 'severe' ? 4 : storm.severity === 'moderate' ? 3 : 2;
    put('shield', want);
  } else if (!view.hasForecast) {
    put('shield', 2); // flying blind: play it safer
  } else if (doseRoom / solsLeft < CONFIG.baseDose + 14) {
    put('shield', 2); // dose budget is getting tight
  }

  // Science with what is left, unless a big storm makes going outside costly.
  const bigStorm = storm && (storm.sep || storm.severity === 'severe');
  const behind = scienceNeeded > (solsLeft - 1) * 3;
  if (scienceNeeded > 0 && (!bigStorm || behind)) {
    put('science', Math.min(left - reserve, scienceNeeded));
  }
  if (!lastSol && left > reserve && !storm && scienceNeeded === 0) put('shield', left - reserve);
  return a;
};

export const STRATEGIES: { id: string; label: string; fixed: boolean; make: (seed: number) => Strategy }[] = [
  { id: 'science', label: 'All-in Science', fixed: true, make: () => allScience },
  { id: 'safety', label: 'All-in Safety', fixed: true, make: () => allSafety },
  { id: 'balanced', label: 'Balanced (fixed)', fixed: true, make: () => balanced },
  { id: 'comms', label: 'Comms-first (fixed)', fixed: true, make: () => commsFirst },
  { id: 'random', label: 'Random', fixed: false, make: (seed) => randomStrategy(seed) },
  { id: 'adaptive', label: 'Adaptive (reacts to warnings)', fixed: false, make: () => adaptive },
];
