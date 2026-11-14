import { CONFIG } from './config';
import type { FailReason, GameState, SolRecord } from './state';

// Pure helpers that turn the mission history into kid-friendly explanations.

const SEVERITY_WORD = { minor: 'small', moderate: 'medium', severe: 'big' } as const;

export function stormName(r: Pick<SolRecord, 'storm'>): string {
  if (!r.storm) return '';
  const size = SEVERITY_WORD[r.storm.severity];
  return r.storm.sep ? `${size} solar storm with a particle blast` : `${size} solar storm`;
}

const cells = (n: number) => `${n} ${n === 1 ? 'cell' : 'cells'}`;

/** The one thing to explain at night: what happened and why. */
export function nightNote(r: SolRecord): { icon: string; title: string; text: string } {
  if (r.storm) {
    const blockedPct = Math.round(Math.min(r.alloc.shield, CONFIG.shieldMaxCells) * CONFIG.shieldPerCell * 100);
    const warned = r.forecast ? '' : ' You had no warning, because Comms had no power yesterday.';
    if (blockedPct >= 60)
      return {
        icon: '🛡️',
        title: 'Your shield held!',
        text: `A ${stormName(r)} hit. Your shield blocked ${blockedPct}% of the radiation, about ${Math.round(r.doseBlocked)} mSv.` +
          (r.alloc.science > 0 ? ` But the crew working outside still got ${Math.round(r.doseEva)} mSv.` : ''),
      };
    if (blockedPct > 0)
      return {
        icon: '☀️',
        title: 'A solar storm got through',
        text: `A ${stormName(r)} hit. Your shield only blocked ${blockedPct}%. The crew's dose went up by ${Math.round(r.doseAdded)} mSv.${warned}`,
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
  sol: number;
  tone: 'good' | 'bad';
  title: string;
  why: string;
  weight: number;
}

/** The 2–3 choices that mattered most for how the mission ended. */
export function keyDecisions(state: GameState): KeyDecision[] {
  const fail: FailReason | null = state.failReason;
  const list: KeyDecision[] = [];
  const boost = (kind: FailReason) => (fail === kind ? 2 : 1);

  for (const r of state.history) {
    if (r.storm) {
      const taken = r.doseAdded - CONFIG.baseDose;
      if (r.alloc.shield < 3 && taken > 25)
        list.push({
          sol: r.sol,
          tone: 'bad',
          title: `Sol ${r.sol}: storm with ${r.alloc.shield === 0 ? 'no' : 'a thin'} shield`,
          why:
            `A ${stormName(r)} hit while Shielding had ${cells(r.alloc.shield)}. The dose jumped by ${Math.round(r.doseAdded)} mSv. ` +
            (r.forecast
              ? 'You had a warning that morning.'
              : `You had no warning: Comms got no power on sol ${r.sol - 1}.`),
          weight: taken * boost('radiation'),
        });
      if (r.doseBlocked >= 40)
        list.push({
          sol: r.sol,
          tone: 'good',
          title: `Sol ${r.sol}: you sheltered from the storm`,
          why:
            `${cells(r.alloc.shield)} in Shielding blocked about ${Math.round(r.doseBlocked)} mSv from a ${stormName(r)}. ` +
            `That power could not go to Science, so you got ${r.scienceGained} ${r.scienceGained === 1 ? 'sample' : 'samples'} that sol.`,
          weight: r.doseBlocked * 0.7 * (fail === 'science' ? 1.5 : 1),
        });
      if (r.alloc.science > 0 && r.doseEva > 20)
        list.push({
          sol: r.sol,
          tone: 'bad',
          title: `Sol ${r.sol}: working outside in a storm`,
          why: `The crew did science outside during a ${stormName(r)}. The shelter cannot protect people outside, so they got ${Math.round(r.doseEva)} mSv.`,
          weight: r.doseEva * boost('radiation'),
        });
    }
    const lifeDrop = r.lifeBefore - r.lifeAfter;
    if (lifeDrop >= 10) {
      const reasons: string[] = [];
      if (r.alloc.life < CONFIG.lifeNeed) reasons.push(`Life Support got ${cells(r.alloc.life)} but needs ${CONFIG.lifeNeed}`);
      if (r.coldNight) reasons.push('the battery was empty on a dusty night');
      if (r.small === 'wear') reasons.push('a part wore out');
      list.push({
        sol: r.sol,
        tone: 'bad',
        title: `Sol ${r.sol}: Life Support dropped by ${lifeDrop}`,
        why: `${reasons.join(' and ')}.`.replace(/^./, (c) => c.toUpperCase()),
        weight: lifeDrop * 2.5 * boost('life'),
      });
    }
    if (r.scienceGained >= 4)
      list.push({
        sol: r.sol,
        tone: 'good',
        title: `Sol ${r.sol}: a big science day`,
        why: `${cells(r.alloc.science)} in Science collected ${r.scienceGained} samples. The cost: ${Math.round(r.doseEva)} mSv from working outside, and less power for other systems.`,
        weight: r.scienceGained * 6,
      });
    if (!r.storm && r.scienceGained === 0 && r.solar >= CONFIG.solarClear)
      list.push({
        sol: r.sol,
        tone: 'bad',
        title: `Sol ${r.sol}: a calm sol with no science`,
        why: 'The Sun was bright and there was no storm, but Science got no power. Calm sols are the best time to collect samples.',
        weight: 14 * boost('science'),
      });
    if (!r.forecast && r.storm)
      list.push({
        sol: r.sol,
        tone: 'bad',
        title: `Sol ${r.sol - 1}: no power for Comms`,
        why: `Without Comms, no warning could arrive from Earth. The storm on sol ${r.sol} was a surprise.`,
        weight: 18 * boost('radiation'),
      });
  }

  const top = list.sort((a, b) => b.weight - a.weight);
  const picked: KeyDecision[] = [];
  for (const d of top) {
    if (picked.length >= 3) break;
    if (picked.some((p) => p.title === d.title)) continue;
    picked.push(d);
  }
  return picked.sort((a, b) => a.sol - b.sol);
}

export function outcomeText(state: GameState): { title: string; text: string } {
  if (state.status === 'won')
    return {
      title: 'Mission complete!',
      text: `Your crew is safe and you collected ${state.science} samples. You kept everyone under the radiation limit with ${Math.round(CONFIG.doseLimit - state.dose)} mSv to spare.`,
    };
  if (state.failReason === 'life')
    return {
      title: 'Mission ended early: Life Support ran out',
      text: `On sol ${state.sol}, the outpost ran out of air, water or food. The crew had to leave in the rescue ship. Everyone is OK, and you can try again.`,
    };
  if (state.failReason === 'radiation')
    return {
      title: 'Mission ended early: too much radiation',
      text: `On sol ${state.sol}, the crew's dose passed the safe limit of ${CONFIG.doseLimit} mSv. Mission Control called them home to stay healthy. You can try again.`,
    };
  return {
    title: 'Crew safe, but the science goal was missed',
    text: `Everyone stayed healthy, but you collected ${state.science} of ${CONFIG.scienceGoal} samples. A Mars mission also has to do science. Staying safe is not enough.`,
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
