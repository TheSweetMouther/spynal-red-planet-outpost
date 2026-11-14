import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { buildPlan, randomScenario } from '../src/sim/events';
import { makeRng } from '../src/sim/rng';
import {
  batteryAfterAllocation,
  chargeFrom,
  doseFor,
  lifeDeltaFromCells,
  morning,
  newGame,
  playMission,
  preview,
  step,
} from '../src/sim/step';
import { adaptive, allSafety, allScience, balanced } from '../src/sim/strategies';
import type { Allocation, GameState, Scenario, SolPlan, Storm } from '../src/sim/state';

const alloc = (life = 0, shield = 0, comms = 0, science = 0): Allocation => ({ life, shield, comms, science });
const calm: Scenario = { id: 'calm', storms: Array(CONFIG.sols).fill(null) };

/** A game with a hand-written plan, so tests do not depend on the RNG. */
function gameWith(plan: Partial<SolPlan>[]): GameState {
  const g = newGame(calm, 1);
  const full: SolPlan[] = Array.from({ length: CONFIG.sols }, (_, i) => ({
    solar: CONFIG.solarClear,
    dust: false,
    storm: null,
    small: null,
    ...(plan[i] ?? {}),
  }));
  return { ...g, plan: full };
}

describe('resource math', () => {
  it('charging loses every third saved cell', () => {
    expect(chargeFrom(0)).toEqual({ stored: 0, lost: 0 });
    expect(chargeFrom(2)).toEqual({ stored: 2, lost: 0 });
    expect(chargeFrom(3)).toEqual({ stored: 2, lost: 1 });
    expect(chargeFrom(6)).toEqual({ stored: 4, lost: 2 });
  });

  it('uses solar cells first, then the battery', () => {
    expect(batteryAfterAllocation(8, 2, 9)).toMatchObject({ after: 1, batteryUsed: 1 });
    expect(batteryAfterAllocation(8, 2, 6)).toMatchObject({ after: 4, batteryUsed: 0 });
  });

  it('caps the battery', () => {
    const r = batteryAfterAllocation(8, CONFIG.batteryMax, 0);
    expect(r.after).toBe(CONFIG.batteryMax);
    expect(r.lost).toBeGreaterThan(0);
  });

  it('life support needs 3 cells', () => {
    expect(lifeDeltaFromCells(3)).toBe(0);
    expect(lifeDeltaFromCells(1)).toBe(-2 * CONFIG.lifeLossPerMissing);
    expect(lifeDeltaFromCells(5)).toBe(2 * CONFIG.lifeGainPerExtra);
  });

  it('each shield cell blocks 20% of the habitat dose, up to 4 cells', () => {
    expect(doseFor(alloc(3, 0), null).total).toBe(CONFIG.baseDose);
    expect(doseFor(alloc(3, 2), null).total).toBeCloseTo(CONFIG.baseDose * 0.6, 1);
    expect(doseFor(alloc(3, 4), null).total).toBe(doseFor(alloc(3, 6), null).total);
  });

  it('science outside adds dose that the shield cannot block', () => {
    const storm: Storm = { severity: 'severe', sep: true };
    const inside = doseFor(alloc(3, 4, 0, 0), storm);
    const outside = doseFor(alloc(3, 4, 0, 1), storm);
    expect(outside.total - inside.total).toBeCloseTo(CONFIG.evaDose + CONFIG.evaStormShare * 200, 1);
  });

  it('a linked particle event multiplies the storm dose', () => {
    const plain = doseFor(alloc(), { severity: 'moderate', sep: false });
    const sep = doseFor(alloc(), { severity: 'moderate', sep: true });
    expect(sep.storm).toBe(plain.storm * CONFIG.sepMultiplier);
  });
});

describe('step', () => {
  it('does not change the input state', () => {
    const g = gameWith([]);
    const copy = JSON.stringify(g);
    step(g, alloc(3, 1, 1, 3));
    expect(JSON.stringify(g)).toBe(copy);
  });

  it('rejects spending more cells than available', () => {
    const g = gameWith([]);
    expect(() => step(g, alloc(8, 8, 0, 0))).toThrow();
    expect(() => step(g, alloc(-1, 0, 0, 0))).toThrow();
  });

  it('every bin has a visible cost: moving a cell changes some meter', () => {
    const g = gameWith([]);
    const base = step(g, alloc(3, 1, 1, 2));
    const moreScience = step(g, alloc(3, 0, 1, 3));
    expect(moreScience.science).toBeGreaterThan(base.science);
    expect(moreScience.dose).toBeGreaterThan(base.dose);
    const moreSaved = step(g, alloc(3, 1, 1, 1));
    expect(moreSaved.battery).toBeGreaterThan(base.battery);
    expect(moreSaved.science).toBeLessThan(base.science);
  });

  it('funding comms gives a forecast next sol, and not otherwise', () => {
    const storm: Storm = { severity: 'severe', sep: false };
    const g = gameWith([{}, { storm }]);
    expect(morning(g).hasForecast).toBe(true); // sol 1 briefing
    const withComms = morning(step(g, alloc(3, 0, 1, 0)));
    expect(withComms.hasForecast).toBe(true);
    expect(withComms.stormToday).toEqual(storm);
    const without = morning(step(g, alloc(3, 0, 0, 0)));
    expect(without.hasForecast).toBe(false);
    expect(without.stormToday).toBeUndefined();
  });

  it('the preview never leaks a storm the player has no forecast for', () => {
    const storm: Storm = { severity: 'severe', sep: true };
    const g = step(gameWith([{}, { storm }]), alloc(3, 0, 0, 0));
    const text = preview(g, alloc(3, 0, 0, 0))
      .map((l) => l.text)
      .join(' ');
    expect(text).toContain('no forecast');
    expect(text).toContain(`about ${CONFIG.baseDose}`);
  });

  it('empty battery on a dusty night hurts life support', () => {
    const g = { ...gameWith([{ dust: true, solar: CONFIG.solarDust }]), battery: 0 };
    const cold = step(g, alloc(3, 0, 0, 1));
    expect(cold.history[0].coldNight).toBe(true);
    expect(cold.life).toBe(CONFIG.lifeStart - CONFIG.coldNightLoss);
    const warm = step(g, alloc(3, 0, 0, 0));
    expect(warm.history[0].coldNight).toBe(false);
    expect(warm.life).toBe(CONFIG.lifeStart);
    expect(warm.battery).toBe(0); // saved 1, heaters used 1
  });
});

describe('fail conditions', () => {
  it('life support reaching 0 ends the mission', () => {
    let g = gameWith([]);
    while (g.status === 'playing') g = step(g, alloc(0, 0, 0, 0));
    expect(g.status).toBe('lost');
    expect(g.failReason).toBe('life');
  });

  it('going over the dose limit ends the mission', () => {
    const storm: Storm = { severity: 'severe', sep: true };
    let g = gameWith(Array(CONFIG.sols).fill({ storm }));
    while (g.status === 'playing') g = step(g, alloc(3, 0, 0, 0));
    expect(g.failReason).toBe('radiation');
    expect(g.dose).toBeGreaterThan(CONFIG.doseLimit);
  });

  it('hoarding power for safety fails the science goal', () => {
    const end = playMission(calm, 5, allSafety);
    expect(end.status).toBe('lost');
    expect(end.failReason).toBe('science');
    expect(end.life).toBeGreaterThan(0);
  });

  it('a mission can be won', () => {
    let g = gameWith([]);
    while (g.status === 'playing') g = step(g, alloc(3, 1, 0, 3));
    expect(g.status).toBe('won');
    expect(g.history).toHaveLength(CONFIG.sols);
  });
});

describe('determinism', () => {
  it('rng repeats for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a.next(), a.next(), a.int(1, 9)]).toEqual([b.next(), b.next(), b.int(1, 9)]);
  });

  it('same seed gives the same plan and the same mission', () => {
    for (const seed of [1, 77, 123456]) {
      expect(buildPlan(randomScenario(seed), seed)).toEqual(buildPlan(randomScenario(seed), seed));
      for (const s of [allScience, balanced, adaptive]) {
        expect(playMission(randomScenario(seed), seed, s)).toEqual(playMission(randomScenario(seed), seed, s));
      }
    }
  });

  it('different seeds change event timing', () => {
    const plans = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(buildPlan(randomScenario(s), s))));
    expect(plans.size).toBeGreaterThan(3);
  });

  it('sol 1 never has a storm in random missions', () => {
    for (let s = 0; s < 200; s++) expect(randomScenario(s).storms[0]).toBeNull();
  });
});
