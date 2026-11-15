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
import { adaptive, allSafety, allScience, balanced, fixedPlan, STRATEGIES } from '../src/sim/strategies';
import { bonusSamples, goalSamples, samplesText, starsFor, type Allocation, type GameState, type Scenario, type SolPlan, type Storm } from '../src/sim/state';
import { failureCauses, keyDecisions, nightNote, outcomeText, SCALE_NOTE, STAY_INSIDE } from '../src/sim/debrief';
import { isTutorialDone, markTutorialDone, shouldShowTutorial, TUTORIAL_KEY, type FlagStore } from '../src/ui/tutorial';

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

  it('the shelter blocks a share of the storm dose, never the everyday dose', () => {
    const storm: Storm = { severity: 'severe', sep: false };
    const max = CONFIG.shieldMaxCells;
    // Calm sol: shielding changes nothing.
    expect(doseFor(alloc(3, 0), null).total).toBe(CONFIG.baseDose);
    expect(doseFor(alloc(3, max), null).total).toBe(CONFIG.baseDose);
    // Storm sol: each cell blocks shieldPerCell of the storm, up to shieldMaxCells.
    const open = doseFor(alloc(3, 0), storm);
    expect(open.total).toBe(CONFIG.baseDose + CONFIG.stormDose.severe);
    const one = doseFor(alloc(3, 1), storm);
    expect(one.blocked).toBeCloseTo(CONFIG.stormDose.severe * CONFIG.shieldPerCell, 1);
    const full = doseFor(alloc(3, max), storm);
    expect(full.total).toBeCloseTo(CONFIG.baseDose + CONFIG.stormDose.severe * (1 - max * CONFIG.shieldPerCell), 1);
    expect(doseFor(alloc(3, max + 2), storm).total).toBe(full.total);
    expect(full.total).toBeGreaterThanOrEqual(CONFIG.baseDose);
  });

  it('working outside on a storm sol costs far more than on a calm sol', () => {
    const storm: Storm = { severity: 'severe', sep: true };
    const calmEva = doseFor(alloc(3, 0, 0, 1), null).eva;
    const stormEva = doseFor(alloc(3, CONFIG.shieldMaxCells, 0, 1), storm).eva;
    expect(calmEva).toBe(CONFIG.evaDose);
    expect(stormEva).toBeGreaterThan(calmEva * 5);
  });

  it('science outside adds dose that the shield cannot block', () => {
    const storm: Storm = { severity: 'severe', sep: true };
    const inside = doseFor(alloc(3, CONFIG.shieldMaxCells, 0, 0), storm);
    const outside = doseFor(alloc(3, CONFIG.shieldMaxCells, 0, 1), storm);
    expect(outside.total - inside.total).toBeCloseTo(CONFIG.evaDose + CONFIG.evaStormShare * 200, 1);
    // More cells outside add more, but never more than the whole storm.
    const many = doseFor(alloc(3, CONFIG.shieldMaxCells, 0, 6), storm);
    expect(many.eva).toBeCloseTo(6 * CONFIG.evaDose + CONFIG.evaStormMax * 200, 1);
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

describe('forecast, dust warning and battery', () => {
  it('a funded forecast warns about dust one sol ahead, and the preview explains the battery', () => {
    const g0 = gameWith([{}, {}, { dust: true, solar: CONFIG.solarDust }]);
    const g = step(g0, alloc(3, 0, 1, 4)); // sol 2, with a forecast
    expect(morning(g).dustTomorrow).toBe(true);
    const spendAll = preview(g, alloc(3, 0, 1, 4 + g.battery)).find((l) => l.system === 'battery')!;
    expect(spendAll.text).toContain('saving cells now helps during the dust storm');
    expect(spendAll.tone).toBe('bad');
    const saving = preview(g, alloc(3, 0, 1, 0)).find((l) => l.system === 'battery')!;
    expect(saving.text).toContain('will help during the dust storm');
  });

  it('with no forecast there is no dust warning', () => {
    const g0 = gameWith([{}, {}, { dust: true, solar: CONFIG.solarDust }]);
    const g = step(g0, alloc(3, 0, 0, 4));
    expect(morning(g).dustTomorrow).toBeUndefined();
    const text = preview(g, alloc(3, 0, 0, 5)).map((l) => l.text).join(' ');
    expect(text).not.toContain('dust storm');
  });
});

describe('samples display and stars', () => {
  it('never shows more samples than the goal', () => {
    const goal = CONFIG.scienceGoal;
    for (let n = 0; n <= goal + 30; n++) {
      expect(goalSamples(n)).toBeLessThanOrEqual(goal);
      const text = samplesText(n);
      const shown = Number(text.split(' of ')[0]);
      expect(shown).toBeLessThanOrEqual(goal);
      expect(text.startsWith(`${Math.min(n, goal)} of ${goal}`)).toBe(true);
    }
    expect(samplesText(goal + 9)).toBe(`${goal} of ${goal}, plus 9 bonus`);
    expect(bonusSamples(goal - 1)).toBe(0);
  });

  it('gives 1 star at the goal, 2 at goal + 5, 3 at goal + 10', () => {
    const goal = CONFIG.scienceGoal;
    expect(starsFor(goal - 1)).toBe(0);
    expect(starsFor(goal)).toBe(1);
    expect(starsFor(goal + CONFIG.starStep - 1)).toBe(1);
    expect(starsFor(goal + CONFIG.starStep)).toBe(2);
    expect(starsFor(goal + 2 * CONFIG.starStep)).toBe(3);
    expect(starsFor(goal + 50)).toBe(3);
  });

  it('the win text never says "N of goal" with N above the goal', () => {
    let g = gameWith([]);
    while (g.status === 'playing') g = step(g, alloc(3, 0, 0, 5));
    expect(g.status).toBe('won');
    expect(g.science).toBeGreaterThan(CONFIG.scienceGoal);
    const out = outcomeText(g);
    expect(out.text).not.toMatch(new RegExp(`${g.science} of ${CONFIG.scienceGoal}`));
    expect(out.stars).toBe(starsFor(g.science));
  });
});

describe('night notes', () => {
  it('a calm sol explains the 50x time scale; a storm sol does not', () => {
    const storm: Storm = { severity: 'moderate', sep: false };
    let g = gameWith([{}, { storm }]);
    g = step(g, alloc(3, 0, 1, 4));
    expect(nightNote(g.history[0]).scaleNote).toBe(SCALE_NOTE);
    expect(SCALE_NOTE).toContain(`${CONFIG.solScale} real Mars days`);
    g = step(g, alloc(3, 2, 1, 0));
    expect(nightNote(g.history[1]).scaleNote).toBeUndefined();
  });
});

describe('debrief: failed missions name their cause', () => {
  const big: Storm = { severity: 'severe', sep: true };

  it('dose fail: names the sol with no shield during the storm', () => {
    let g = gameWith([{}, {}, {}, { storm: big }, {}, {}, { storm: big }]);
    while (g.status === 'playing') g = step(g, alloc(3, 0, 1, 4));
    expect(g.failReason).toBe('radiation');
    const causes = failureCauses(g);
    expect(causes.length).toBeGreaterThan(0);
    expect(causes.every((c) => c.cause && c.tone === 'bad')).toBe(true);
    expect(causes.map((c) => c.sols).flat()).toContain(4);
    expect(causes[0].title).toMatch(/^Sol 4: /);
    expect(causes[0].title).toContain('mSv');
    // The debrief list starts with the cause.
    const cards = keyDecisions(g);
    expect(cards[0].cause).toBe(true);
  });

  it('dose fail: a sheltered crew that still worked outside is told so', () => {
    let g = gameWith([{}, { storm: big }, { storm: big }, { storm: big }]);
    g = step(g, alloc(3, 0, 1, 4));
    while (g.status === 'playing') g = step(g, alloc(3, CONFIG.shieldMaxCells, 1, 2));
    expect(g.failReason).toBe('radiation');
    const causes = failureCauses(g);
    expect(causes[0].title).toContain('worked outside');
    expect([2, 3, 4]).toContain(causes[0].sol);
  });

  it('life support fail: names the sols that got too few cells', () => {
    let g = gameWith([]);
    g = step(g, alloc(3, 0, 1, 4));
    g = step(g, alloc(3, 0, 1, 4));
    while (g.status === 'playing') g = step(g, alloc(0, 0, 1, 5));
    expect(g.failReason).toBe('life');
    const causes = failureCauses(g);
    expect(causes[0].sols[0]).toBe(3);
    expect(causes[0].sols[causes[0].sols.length - 1]).toBe(g.history.length);
    expect(causes[0].title).toMatch(/^Sols 3–\d+: Life Support got too few cells/);
  });

  it('life support fail: names cold dusty nights', () => {
    const dusty = { dust: true, solar: CONFIG.solarDust };
    let g = { ...gameWith(Array(CONFIG.sols).fill(dusty)), battery: 0, life: 30 };
    while (g.status === 'playing') g = step(g, alloc(3, 0, 0, 1));
    expect(g.failReason).toBe('life');
    const causes = failureCauses(g);
    expect(causes[0].title).toContain('empty battery');
    expect(causes[0].sols).toEqual(g.history.map((r) => r.sol));
  });

  it('science fail: names the dust sols when an empty battery stopped science', () => {
    const dusty = { dust: true, solar: CONFIG.solarDust };
    let g = gameWith([{}, {}, {}, {}, {}, {}, dusty, dusty, dusty, {}]);
    while (g.status === 'playing') {
      const m = morning(g);
      // Spends everything each sol: nothing is saved for the dust.
      g = step(g, m.dust ? alloc(3, 0, 1, m.available - 4) : alloc(3, 2, 1, m.available - 6));
    }
    expect(g.failReason).toBe('science');
    const causes = failureCauses(g);
    const dustCard = causes.find((c) => c.title.includes('dust storm'))!;
    expect(dustCard).toBeDefined();
    expect(dustCard.sols).toEqual([7, 8, 9]);
    expect(dustCard.title).toBe('Sols 7–9: dust storm and an empty battery left no power for science');
    expect(keyDecisions(g).some((c) => c.cause && c.title === dustCard.title)).toBe(true);
  });

  it('science fail: names calm sols where the power went elsewhere', () => {
    const end = playMission(calm, 5, allSafety);
    expect(end.failReason).toBe('science');
    const causes = failureCauses(end);
    expect(causes[0].title).toContain('calm sols with little science');
    expect(causes[0].sols[0]).toBe(1);
    expect(causes[0].why).toContain('Shielding');
  });

  it('every failed robot mission gets a cause card about sols that were played', () => {
    let failed = 0;
    for (const s of STRATEGIES) {
      for (let i = 0; i < 40; i++) {
        const seed = 500 + i * 131;
        const end = playMission(randomScenario(seed), seed, s.make(seed));
        if (end.status !== 'lost') continue;
        failed++;
        const causes = failureCauses(end);
        expect(causes.length, `${s.id} seed ${seed}`).toBeGreaterThan(0);
        for (const c of causes) {
          expect(c.sols.length).toBeGreaterThan(0);
          expect(c.sols.every((n) => n >= 1 && n <= end.history.length)).toBe(true);
          expect(c.title).toMatch(/^Sols? \d+/);
        }
        const cards = keyDecisions(end);
        expect(cards[0].cause).toBe(true);
      }
    }
    expect(failed).toBeGreaterThan(100);
  });

  it('a won mission has no cause cards', () => {
    let g = gameWith([]);
    while (g.status === 'playing') g = step(g, alloc(3, 0, 1, 4));
    expect(g.status).toBe('won');
    expect(failureCauses(g)).toEqual([]);
    expect(keyDecisions(g).every((c) => !c.cause)).toBe(true);
  });
});

describe('balance guard', () => {
  it('a fixed plan with no Comms does not beat the adaptive player on random missions', () => {
    const wins = (make: (seed: number) => ReturnType<typeof fixedPlan>) => {
      let n = 0;
      for (let i = 0; i < 200; i++) {
        const seed = 1000 + i * 7919;
        if (playMission(randomScenario(seed), seed, make(seed)).status === 'won') n++;
      }
      return n / 200;
    };
    const best = Math.max(...STRATEGIES.filter((s) => s.fixed).map((s) => wins(s.make)));
    const smart = wins(() => adaptive);
    expect(best).toBeLessThanOrEqual(0.6);
    expect(smart - best).toBeGreaterThanOrEqual(0.15);
  });
});

describe('working outside on a storm sol is always called out', () => {
  const storms: Storm[] = [
    { severity: 'minor', sep: false },
    { severity: 'moderate', sep: false },
    { severity: 'severe', sep: true },
  ];

  it('the preview shows a warning line with the dose number whenever Science > 0 on a warned storm sol', () => {
    for (const storm of storms) {
      const g = step(gameWith([{}, { storm }]), alloc(3, 0, 1, 4)); // sol 2, warned
      expect(morning(g).stormToday).toEqual(storm);
      for (const science of [1, 3]) {
        for (const shield of [0, CONFIG.shieldMaxCells]) {
          const a = alloc(3, shield, 1, science);
          const line = preview(g, a).find((l) => l.system === 'dose')!;
          expect(line.tone, `${storm.severity} science ${science} shield ${shield}`).toBe('bad');
          const d = doseFor(a, storm);
          expect(line.text).toContain(`goes up by about ${Math.round(d.total)}`);
          expect(line.text).toContain(`Working outside in the storm adds ${Math.round(d.eva)}`);
        }
      }
      // Staying inside behind a full shelter is not flagged for a small storm.
      const inside = preview(g, alloc(3, CONFIG.shieldMaxCells, 1, 0)).find((l) => l.system === 'dose')!;
      expect(inside.text).not.toContain('Working outside');
    }
  });

  it('the night screen says to keep the crew inside next time', () => {
    for (const storm of storms) {
      for (const comms of [0, 1]) {
        for (const shield of [0, 1, CONFIG.shieldMaxCells]) {
          const g1 = step(gameWith([{}, { storm }]), alloc(3, 0, comms, 2));
          const out = step(g1, alloc(3, shield, 0, 2));
          const note = nightNote(out.history[1]);
          expect(note.text.endsWith(STAY_INSIDE), `${storm.severity} shield ${shield}`).toBe(true);
          expect(note.text).toMatch(/outside/i);
          const stayed = step(g1, alloc(3, shield, 0, 0));
          expect(nightNote(stayed.history[1]).text).not.toContain(STAY_INSIDE);
        }
      }
    }
    expect(STAY_INSIDE).toBe('Next time, keep the crew inside on storm sols.');
  });
});

describe('tutorial is shown once', () => {
  const memory = (): FlagStore & { data: Record<string, string> } => ({
    data: {},
    getItem(k) {
      return k in this.data ? this.data[k] : null;
    },
    setItem(k, v) {
      this.data[k] = v;
    },
  });

  it('shows on the first mission, then never again once finished or skipped', () => {
    const store = memory();
    expect(isTutorialDone(store)).toBe(false);
    expect(shouldShowTutorial(false, store)).toBe(true);
    markTutorialDone(store); // called when the player finishes or skips
    expect(store.data[TUTORIAL_KEY]).toBe('1');
    expect(isTutorialDone(store)).toBe(true);
    expect(shouldShowTutorial(false, store)).toBe(false); // second mission, Random mission, ...
  });

  it('"Replay tutorial" shows it again', () => {
    const store = memory();
    markTutorialDone(store);
    expect(shouldShowTutorial(true, store)).toBe(true);
  });

  it('blocked or missing storage never throws', () => {
    const broken: FlagStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('full');
      },
    };
    expect(() => markTutorialDone(broken)).not.toThrow();
    expect(isTutorialDone(broken)).toBe(false);
    expect(shouldShowTutorial(false, broken)).toBe(true);
    expect(() => markTutorialDone(null)).not.toThrow();
    expect(shouldShowTutorial(false, null)).toBe(true);
  });
});
