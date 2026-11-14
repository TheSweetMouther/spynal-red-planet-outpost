import { CONFIG } from './config';
import { makeRng, type Rng } from './rng';
import type { Scenario, Severity, SmallEvent, SolPlan, Storm } from './state';

function weighted<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Storms for a "Random" mission. Not real data; clearly labelled in the UI. */
export function randomScenario(seed: number): Scenario {
  const rng = makeRng(seed ^ 0x51ed270b);
  const storms: (Storm | null)[] = Array(CONFIG.sols).fill(null);
  const count = rng.int(CONFIG.random.stormsMin, CONFIG.random.stormsMax);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < 200) {
    const i = rng.int(1, CONFIG.sols - 1); // never on sol 1
    if (storms[i]) continue;
    const severity: Severity = weighted(rng, CONFIG.random.severityWeights);
    storms[i] = { severity, sep: rng.chance(CONFIG.random.sepChance[severity]) };
    placed++;
  }
  return { id: 'random', storms };
}

/**
 * Turn a scenario + seed into the full hidden plan for the mission.
 * Storms come from the scenario (real data or random). The dust storm and the
 * small game events are placed by the seeded RNG, so timing varies by seed.
 */
export function buildPlan(scenario: Scenario, seed: number): SolPlan[] {
  const rng = makeRng(seed);
  const n = CONFIG.sols;
  const dust: boolean[] = Array(n).fill(false);
  if (rng.chance(CONFIG.dustChance)) {
    const start = rng.int(CONFIG.dustStartMin, CONFIG.dustStartMax); // 1-based sol
    for (let s = start; s < start + CONFIG.dustLength && s <= n; s++) dust[s - 1] = true;
  }

  const small: (SmallEvent | null)[] = Array(n).fill(null);
  const place = (ev: SmallEvent) => {
    for (let tries = 0; tries < 50; tries++) {
      const i = rng.int(1, n - 1);
      if (!small[i]) {
        small[i] = ev;
        return;
      }
    }
  };
  place('wear');
  place('harvest');
  if (rng.chance(0.5)) place('wear');

  return Array.from({ length: n }, (_, i) => ({
    solar: dust[i] ? CONFIG.solarDust : CONFIG.solarClear,
    dust: dust[i],
    storm: scenario.storms[i] ?? null,
    small: small[i],
  }));
}
