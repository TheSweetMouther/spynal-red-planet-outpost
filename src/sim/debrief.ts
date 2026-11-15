import { CONFIG } from './config';
import { bonusSamples, goalSamples, starsFor, type FailReason, type GameState, type SolRecord } from './state';

// Pure helpers that turn the mission history into kid-friendly explanations.

const SEVERITY_WORD = { minor: 'small', moderate: 'medium', severe: 'big' } as const;

export function stormName(r: Pick<SolRecord, 'storm'>): string {
  if (!r.storm) return '';
  const size = SEVERITY_WORD[r.storm.severity];
  return r.storm.sep ? `${size} solar storm with a particle blast` : `${size} solar storm`;
}

const cells = (n: number) => (n === 0 ? 'no cells' : `${n} ${n === 1 ? 'cell' : 'cells'}`);

/** The one thing to explain at night: what happened and why. */
export const SCALE_NOTE = `In this game, 1 sol stands for about ${CONFIG.solScale} real Mars days, so the numbers are bigger.`;

export const STORM_HONESTY =
  "Real storms are weaker on Mars' surface because the air blocks a lot. They are most dangerous for astronauts outside or traveling in space.";

export interface NightNote {
  icon: string;
  title: string;
  text: string;
  /** Calm sols explain why the everyday dose looks so big. */
  scaleNote?: string;
}

export const STAY_INSIDE = 'Next time, keep the crew inside on storm sols.';

export function nightNote(r: SolRecord): NightNote {
  const note = baseNightNote(r);
  if (!r.storm) return { ...note, scaleNote: SCALE_NOTE };
  if (r.alloc.science === 0) return note;
  // The crew worked outside during a storm: say how much it cost and what to do.
  const outside = note.text.includes('working outside') ? '' : ` Working outside in the storm added ${Math.round(r.doseEva)} mSv of that.`;
  return { ...note, text: `${note.text}${outside} ${STAY_INSIDE}` };
}

function baseNightNote(r: SolRecord): NightNote {
  if (r.storm) {
    const blockedPct = Math.round(Math.min(r.alloc.shield, CONFIG.shieldMaxCells) * CONFIG.shieldPerCell * 100);
    const warned = r.forecast ? '' : ' You had no warning, because Comms had no power yesterday.';
    if (blockedPct >= 80)
      return {
        icon: '🛡️',
        title: 'Your shield held!',
        text: `A ${stormName(r)} hit. Your shelter blocked ${blockedPct}% of the storm, about ${Math.round(r.doseBlocked)} mSv.` +
          (r.alloc.science > 0
            ? ` But the crew working outside still got ${Math.round(r.doseEva)} mSv. The shelter cannot protect people outside.`
            : ' The crew stayed inside, which is what real astronauts would do.'),
      };
    if (blockedPct > 0)
      return {
        icon: '☀️',
        title: 'A solar storm got through',
        text: `A ${stormName(r)} hit. Your shelter only blocked ${blockedPct}% of the storm. The crew's dose went up by ${Math.round(r.doseAdded)} mSv.${warned}`,
      };
    return {
      icon: '☀️',
      title: 'Solar storm with no shield',
      text: `A ${stormName(r)} hit and Shielding had no power. The crew's dose went up by ${Math.round(r.doseAdded)} mSv.${warned}`,
    };
  }
  if (r.coldNight)
    return {
      icon: '🥶',
      title: 'A cold, dark night',
      text: `Dust blocked the Sun and the battery was empty. The heaters had no power, so Life Support lost ${CONFIG.coldNightLoss}.`,
    };
  if (r.alloc.life < CONFIG.lifeNeed)
    return {
      icon: '❤️',
      title: 'Life Support ran short',
      text: `Life Support needs ${cells(CONFIG.lifeNeed)} each sol. It got ${r.alloc.life}, so air, water and food went down.`,
    };
  if (r.small === 'wear')
    return {
      icon: '🔧',
      title: 'A part wore out (game event)',
      text: `A water pump wore out and Life Support lost ${CONFIG.wearLoss}. Machines on Mars get dusty and tired.`,
    };
  if (r.small === 'harvest')
    return {
      icon: '🥬',
      title: 'Greenhouse harvest (game event)',
      text: `The greenhouse plants grew well. Fresh food gave Life Support +${CONFIG.harvestGain}.`,
    };
  if (r.dust)
    return {
      icon: '🌫️',
      title: 'Dust in the sky',
      text: `Dust blocked sunlight, so the panels made only ${cells(r.solar)}. The battery ran the heaters tonight.`,
    };
  if (r.scienceGained > 0)
    return {
      icon: '🔬',
      title: 'Good science day',
      text: `The crew collected ${r.scienceGained} ${r.scienceGained === 1 ? 'sample' : 'samples'}. Working outside added ${Math.round(r.doseEva)} mSv of radiation.`,
    };
  if (r.batteryAfter > r.batteryBefore)
    return { icon: '🔋', title: 'Saving up', text: `You saved power. The battery now holds ${cells(r.batteryAfter)}.` };
  return { icon: '🌙', title: 'A quiet night', text: 'Nothing went wrong today. The crew is resting.' };
}

export interface KeyDecision {
  /** First sol this card is about (used for ordering). */
  sol: number;
  /** Every sol this card is about. */
  sols: number[];
  tone: 'good' | 'bad';
  /** True when this card explains why the mission failed. */
  cause: boolean;
  title: string;
  why: string;
  weight: number;
}

const solLabel = (sols: number[]) =>
  sols.length === 1 ? `Sol ${sols[0]}` : `Sols ${sols[0]}–${sols[sols.length - 1]}`;

/** Groups of sols in a row that match a test. */
function runs(history: SolRecord[], test: (r: SolRecord) => boolean): SolRecord[][] {
  const out: SolRecord[][] = [];
  let cur: SolRecord[] = [];
  for (const r of history) {
    if (test(r)) cur.push(r);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

const sum = (rs: SolRecord[], f: (r: SolRecord) => number) => rs.reduce((t, r) => t + f(r), 0);
/** Samples a calm, clear sol can give after Life Support and Comms are paid. */
const NORMAL_SCIENCE = CONFIG.solarClear - CONFIG.lifeNeed - 1;

/** Life Support lost on one sol, before clamping at zero. */
function lifeLoss(r: SolRecord): number {
  return (
    Math.max(0, CONFIG.lifeNeed - r.alloc.life) * CONFIG.lifeLossPerMissing +
    (r.coldNight ? CONFIG.coldNightLoss : 0) +
    (r.small === 'wear' ? CONFIG.wearLoss : 0)
  );
}

/**
 * Why a failed mission failed: one or two cards that name the sols and the
 * choice (or event) that did the damage. Empty for a won mission.
 */
export function failureCauses(state: GameState): KeyDecision[] {
  const h = state.history;
  const out: KeyDecision[] = [];
  const add = (rs: SolRecord[], title: string, why: string, weight: number) =>
    out.push({
      sol: rs[0].sol,
      sols: rs.map((r) => r.sol),
      tone: 'bad',
      cause: true,
      title: `${solLabel(rs.map((r) => r.sol))}: ${title}`,
      why,
      weight,
    });

  if (state.failReason === 'radiation') {
    for (const r of h) {
      if (!r.storm) continue;
      // Dose that a full shelter and no outside work would have avoided.
      const best = r.stormDose * (1 - CONFIG.shieldMaxCells * CONFIG.shieldPerCell);
      const stormEva = Math.min(CONFIG.evaStormMax, r.alloc.science * CONFIG.evaStormShare) * r.stormDose;
      const avoidable = r.doseAdded - CONFIG.baseDose - r.alloc.science * CONFIG.evaDose - best;
      if (avoidable < 15) continue;
      const added = `+${Math.round(r.doseAdded)} mSv`;
      const warned = r.forecast
        ? 'You had a warning that morning.'
        : `You had no warning, because Comms got no power on sol ${r.sol - 1}.`;
      const shieldless = r.alloc.shield === 0;
      const thin = r.alloc.shield < CONFIG.shieldMaxCells;
      if (stormEva > 0 && stormEva >= avoidable / 2)
        add(
          [r],
          `the crew worked outside during a ${stormName(r)} (${added})`,
          `${cells(r.alloc.science)} in Science sent the crew outside, where the shelter cannot protect them. That alone added ${Math.round(r.doseEva)} mSv.` +
            (thin ? ` Shielding had ${cells(r.alloc.shield)}.` : '') +
            ` ${warned} On a storm sol, the safe plan is to stay inside.`,
          avoidable,
        );
      else
        add(
          [r],
          `${shieldless ? 'no shield' : 'a thin shield'} during a ${stormName(r)} (${added})`,
          `Shielding had ${cells(r.alloc.shield)}, so most of the storm reached the crew. ${CONFIG.shieldMaxCells} cells would have blocked ${CONFIG.shieldMaxCells * CONFIG.shieldPerCell * 100}% of it. ${warned}`,
          avoidable,
        );
    }
    if (out.length === 0) {
      const eva = Math.round(sum(h, (r) => r.doseEva));
      add(
        h,
        `work outside added ${eva} mSv, on top of everyday radiation`,
        `Every sol on Mars adds about ${CONFIG.baseDose} mSv that no shelter can block. Working outside added ${eva} mSv more, and the total passed ${CONFIG.doseLimit} mSv. Fewer Science cells on some sols would have kept the crew under the limit.`,
        eva,
      );
    }
  } else if (state.failReason === 'life') {
    for (const rs of runs(h, (r) => r.alloc.life < CONFIG.lifeNeed)) {
      const lost = sum(rs, (r) => (CONFIG.lifeNeed - r.alloc.life) * CONFIG.lifeLossPerMissing);
      add(
        rs,
        `Life Support got too few cells (−${lost})`,
        `Life Support needs ${cells(CONFIG.lifeNeed)} every sol. It got ${rs.map((r) => r.alloc.life).join(', ')}. Air, water and food ran down by ${lost}.`,
        lost,
      );
    }
    for (const rs of runs(h, (r) => r.coldNight)) {
      const lost = rs.length * CONFIG.coldNightLoss;
      add(
        rs,
        `empty battery on ${rs.length === 1 ? 'a dusty night' : 'dusty nights'} (−${lost})`,
        'Dust blocked the Sun and the battery had nothing left for the heaters. Saving a few cells before the dust storm would have kept the crew warm.',
        lost,
      );
    }
    if (out.length === 0) {
      const worn = h.filter((r) => r.small === 'wear');
      if (worn.length)
        add(worn, 'parts wore out', `Worn-out parts cost Life Support ${worn.length * CONFIG.wearLoss}. Extra Life Support cells can repair the damage.`, 1);
    }
  } else if (state.failReason === 'science') {
    const short = CONFIG.scienceGoal - state.science;
    // Dust sols with almost no science.
    for (const rs of runs(h, (r) => r.dust && r.scienceGained <= 1)) {
      const lost = rs.length * NORMAL_SCIENCE - sum(rs, (r) => r.scienceGained);
      const empty = rs[0].batteryBefore <= 1;
      add(
        rs,
        `dust storm and ${empty ? 'an empty battery' : 'a low battery'} left no power for science`,
        `The panels made only ${cells(CONFIG.solarDust)} a sol, and Life Support needs ${CONFIG.lifeNeed}. The battery held ${cells(rs[0].batteryBefore)} when the dust arrived. ` +
          `A full battery (${CONFIG.batteryMax} cells) would have kept the rover working. About ${lost} samples were lost here.`,
        lost,
      );
    }
    // Calm, clear sols where little science was done.
    for (const rs of runs(h, (r) => !r.storm && !r.dust && r.scienceGained < NORMAL_SCIENCE - 1)) {
      const lost = rs.length * NORMAL_SCIENCE - sum(rs, (r) => r.scienceGained);
      const shield = sum(rs, (r) => r.alloc.shield);
      const extraLife = sum(rs, (r) => Math.max(0, r.alloc.life - CONFIG.lifeNeed));
      const extraComms = sum(rs, (r) => Math.max(0, r.alloc.comms - 1));
      const saved = sum(rs, (r) => Math.max(0, r.batteryAfter - r.batteryBefore) + r.chargeLost);
      const where: string[] = [];
      if (shield > 0) where.push(`${cells(shield)} went to Shielding with no storm to block`);
      if (extraLife > 0) where.push(`${cells(extraLife)} more than needed went to Life Support`);
      if (extraComms > 0) where.push(`${cells(extraComms)} more than needed went to Comms`);
      if (saved > 0) where.push(`${cells(saved)} went to the battery`);
      add(
        rs,
        `${rs.length === 1 ? 'a calm sol' : 'calm sols'} with little science`,
        `The sky was clear and no storm came, but Science got ${sum(rs, (r) => r.alloc.science) === 0 ? "no cells" : `only ${cells(sum(rs, (r) => r.alloc.science))}`}. ` +
          (where.length ? `${where.join(', and ')}. `.replace(/^./, (c) => c.toUpperCase()) : '') +
          `Calm sols are the best time to collect samples. About ${lost} samples were lost here.`,
        lost,
      );
    }
    if (out.length === 0) {
      const stormy = h.filter((r) => r.storm && r.scienceGained === 0);
      if (stormy.length)
        add(
          stormy,
          'storm sols with no science',
          `Staying inside during storms kept the crew safe, but it left too few sols for science. You ended ${short} ${short === 1 ? 'sample' : 'samples'} short. Saving spare cells in the battery on storm sols gives more power for science later.`,
          1,
        );
      else add(h, `${short} ${short === 1 ? 'sample' : 'samples'} short`, 'Science needed a few more cells across the mission.', 1);
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 2);
}

/** The choices that mattered most for how the mission ended. Failure causes always come first. */
export function keyDecisions(state: GameState): KeyDecision[] {
  const fail: FailReason | null = state.failReason;
  const list: KeyDecision[] = [];
  const boost = (kind: FailReason) => (fail === kind ? 2 : 1);
  const push = (r: SolRecord, tone: 'good' | 'bad', title: string, why: string, weight: number) =>
    list.push({ sol: r.sol, sols: [r.sol], tone, cause: false, title, why, weight });

  for (const r of state.history) {
    if (r.storm) {
      const taken = r.doseAdded - CONFIG.baseDose;
      if (r.alloc.shield < CONFIG.shieldMaxCells && taken > 25)
        push(
          r,
          'bad',
          `Sol ${r.sol}: storm with ${r.alloc.shield === 0 ? 'no' : 'a thin'} shield`,
          `A ${stormName(r)} hit while Shielding had ${cells(r.alloc.shield)}. The dose jumped by ${Math.round(r.doseAdded)} mSv. ` +
            (r.forecast ? 'You had a warning that morning.' : `You had no warning: Comms got no power on sol ${r.sol - 1}.`),
          taken * boost('radiation'),
        );
      if (r.doseBlocked >= 25)
        push(
          r,
          'good',
          `Sol ${r.sol}: you sheltered from the storm`,
          `${cells(r.alloc.shield)} in Shielding blocked about ${Math.round(r.doseBlocked)} mSv from a ${stormName(r)}. ` +
            (r.scienceGained === 0
              ? 'The crew stayed inside, so no samples were collected that sol.'
              : `The crew still collected ${r.scienceGained} ${r.scienceGained === 1 ? 'sample' : 'samples'} outside, which added ${Math.round(r.doseEva)} mSv.`),
          r.doseBlocked * 0.7,
        );
      if (r.alloc.science > 0 && r.doseEva > 20)
        push(
          r,
          'bad',
          `Sol ${r.sol}: working outside in a storm`,
          `The crew did science outside during a ${stormName(r)}. The shelter cannot protect people outside, so they got ${Math.round(r.doseEva)} mSv.`,
          r.doseEva * boost('radiation'),
        );
    }
    const lost = lifeLoss(r);
    if (lost >= 10) {
      const reasons: string[] = [];
      if (r.alloc.life < CONFIG.lifeNeed) reasons.push(`Life Support got ${cells(r.alloc.life)} but needs ${CONFIG.lifeNeed}`);
      if (r.coldNight) reasons.push('the battery was empty on a dusty night');
      if (r.small === 'wear') reasons.push('a part wore out');
      push(
        r,
        'bad',
        `Sol ${r.sol}: Life Support dropped by ${lost}`,
        `${reasons.join(' and ')}.`.replace(/^./, (c) => c.toUpperCase()),
        lost * 2.5 * boost('life'),
      );
    }
    if (r.scienceGained >= NORMAL_SCIENCE && !r.storm)
      push(
        r,
        'good',
        `Sol ${r.sol}: a big science day`,
        `${cells(r.alloc.science)} in Science collected ${r.scienceGained} samples on a calm sol. The cost: ${Math.round(r.doseEva)} mSv from working outside.`,
        r.scienceGained * 5,
      );
    if (r.dust && !r.coldNight && r.batteryBefore >= 3 && r.sol > 1 && !state.history[r.sol - 2].dust)
      push(
        r,
        'good',
        `Sol ${r.sol}: the battery was ready for the dust`,
        `You had ${cells(r.batteryBefore)} saved when the dust storm began. That kept the heaters on and left some power for other systems.`,
        22,
      );
    if (!r.forecast && r.storm)
      push(
        r,
        'bad',
        `Sol ${r.sol - 1}: no power for Comms`,
        `Without Comms, no warning could arrive from Earth. The storm on sol ${r.sol} was a surprise.`,
        18 * boost('radiation'),
      );
  }

  const causes = failureCauses(state);
  const covered = new Set(causes.flatMap((c) => c.sols));
  const picked: KeyDecision[] = [...causes];
  for (const d of list.sort((a, b) => b.weight - a.weight)) {
    if (picked.length >= 3) break;
    if (picked.some((p) => p.title === d.title)) continue;
    // A cause card already explains the bad choices on its sols.
    if (d.tone === 'bad' && covered.has(d.sol)) continue;
    picked.push(d);
  }
  return picked.sort((a, b) => Number(b.cause) - Number(a.cause) || a.sol - b.sol);
}

const STAR_TEXT = [
  '',
  `Collect ${CONFIG.starStep} bonus samples for a second star.`,
  `Collect ${CONFIG.starStep * 2} bonus samples for a third star.`,
  'Three stars: a top science mission!',
];

export function outcomeText(state: GameState): { title: string; text: string; stars: number } {
  const stars = starsFor(state.science);
  if (state.status === 'won') {
    const bonus = bonusSamples(state.science);
    return {
      title: 'Mission complete!',
      text:
        `Your crew is safe and you reached the goal of ${CONFIG.scienceGoal} samples` +
        (bonus > 0 ? `, plus ${bonus} bonus ${bonus === 1 ? 'sample' : 'samples'}` : '') +
        `. You kept everyone under the radiation limit with ${Math.round(CONFIG.doseLimit - state.dose)} mSv to spare. ${STAR_TEXT[stars]}`,
      stars,
    };
  }
  if (state.failReason === 'life')
    return {
      title: 'Mission ended early: Life Support ran out',
      text: `On sol ${state.sol}, the outpost ran out of air, water or food. The crew had to leave in the rescue ship. Everyone is OK, and you can try again.`,
      stars: 0,
    };
  if (state.failReason === 'radiation')
    return {
      title: 'Mission ended early: too much radiation',
      text: `On sol ${state.sol}, the crew's dose passed the safe limit of ${CONFIG.doseLimit} mSv. Mission Control called them home to stay healthy. You can try again.`,
      stars: 0,
    };
  return {
    title: 'Crew safe, but the science goal was missed',
    text: `Everyone stayed healthy, but you collected ${goalSamples(state.science)} of ${CONFIG.scienceGoal} samples. A Mars mission also has to do science. Staying safe is not enough.`,
    stars: 0,
  };
}

export type CardId = 'bone' | 'muscle' | 'sleep' | 'radiation' | 'iss_compare' | 'food';

/** "Real NASA Science" cards unlocked by what happened in this mission. */
export function unlockedCards(state: GameState): { id: CardId; because: string }[] {
  const h = state.history;
  const out: { id: CardId; because: string }[] = [];
  const storms = h.filter((r) => r.storm).length;
  if (storms > 0) out.push({ id: 'radiation', because: `Your crew lived through ${storms} solar ${storms === 1 ? 'storm' : 'storms'}.` });
  if (h.length >= 3) out.push({ id: 'iss_compare', because: `Your crew's dose reached ${Math.round(state.dose)} mSv.` });
  if (h.some((r) => r.small === 'harvest') || h.some((r) => r.alloc.life > CONFIG.lifeNeed))
    out.push({ id: 'food', because: 'Your greenhouse helped keep Life Support up.' });
  if (state.science >= CONFIG.scienceGoal / 2) out.push({ id: 'muscle', because: 'Your crew did lots of hard work outside.' });
  if (h.length >= CONFIG.sols) out.push({ id: 'bone', because: 'Your crew stayed for the whole mission.' });
  if (h.length >= 5) out.push({ id: 'sleep', because: 'Your crew lived on Mars time for many sols.' });
  return out;
}
