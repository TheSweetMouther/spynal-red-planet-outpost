import { CONFIG } from './config';
import { buildPlan } from './events';
import {
  round1,
  stormDoseOf,
  totalCells,
  type Allocation,
  type GameState,
  type MorningView,
  type Scenario,
  type SolRecord,
  type Storm,
} from './state';

// Pure simulation: (state, allocation) -> new state. No DOM, no clock, no
// Math.random. All randomness was fixed when the plan was built from the seed.

export function newGame(scenario: Scenario, seed: number): GameState {
  return {
    seed,
    scenarioId: scenario.id,
    plan: buildPlan(scenario, seed),
    sol: 1,
    life: CONFIG.lifeStart,
    dose: 0,
    battery: CONFIG.batteryStart,
    science: 0,
    commsFunded: true, // sol 1: Mission Control briefed the crew before landing
    status: 'playing',
    failReason: null,
    history: [],
  };
}

export function morning(state: GameState): MorningView {
  const today = state.plan[state.sol - 1];
  const tomorrow = state.plan[state.sol];
  const has = state.commsFunded;
  return {
    sol: state.sol,
    solsTotal: CONFIG.sols,
    solar: today.solar,
    battery: state.battery,
    available: today.solar + state.battery,
    dust: today.dust,
    life: state.life,
    dose: state.dose,
    science: state.science,
    hasForecast: has,
    stormToday: has ? today.storm : undefined,
    dustTomorrow: has ? Boolean(tomorrow?.dust) : undefined,
  };
}

export function isValidAllocation(state: GameState, alloc: Allocation): boolean {
  const values = [alloc.life, alloc.shield, alloc.comms, alloc.science];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return false;
  const today = state.plan[state.sol - 1];
  return totalCells(alloc) <= today.solar + state.battery;
}

// ---- The resource math, shared by the preview and the real step ----

export function chargeFrom(unusedSolar: number): { stored: number; lost: number } {
  const lost = Math.floor(unusedSolar / CONFIG.chargeLossEvery);
  return { stored: unusedSolar - lost, lost };
}

export function batteryAfterAllocation(solar: number, battery: number, used: number) {
  const solarUsed = Math.min(used, solar);
  const batteryUsed = used - solarUsed;
  const { stored, lost } = chargeFrom(solar - solarUsed);
  const raw = battery - batteryUsed + stored;
  const after = Math.min(CONFIG.batteryMax, raw);
  return { after, lost: lost + (raw - after), batteryUsed };
}

export function lifeDeltaFromCells(cells: number): number {
  if (cells < CONFIG.lifeNeed) return -(CONFIG.lifeNeed - cells) * CONFIG.lifeLossPerMissing;
  return (cells - CONFIG.lifeNeed) * CONFIG.lifeGainPerExtra;
}

export function shieldFraction(cells: number): number {
  return Math.min(cells, CONFIG.shieldMaxCells) * CONFIG.shieldPerCell;
}

export interface DoseParts {
  /** Dose that reached the crew inside the habitat. */
  habitat: number;
  blocked: number;
  eva: number;
  total: number;
  storm: number;
}

export function doseFor(alloc: Allocation, storm: Storm | null): DoseParts {
  const stormDose = stormDoseOf(storm);
  const incoming = CONFIG.baseDose + stormDose;
  const blocked = incoming * shieldFraction(alloc.shield);
  const habitat = incoming - blocked;
  const eva = alloc.science * (CONFIG.evaDose + CONFIG.evaStormShare * stormDose);
  return {
    habitat: round1(habitat),
    blocked: round1(blocked),
    eva: round1(eva),
    total: round1(habitat + eva),
    storm: stormDose,
  };
}

/** Advance one sol. Returns a new state; the input is not changed. */
export function step(state: GameState, alloc: Allocation): GameState {
  if (state.status !== 'playing') return state;
  if (!isValidAllocation(state, alloc)) throw new Error('Invalid allocation');

  const today = state.plan[state.sol - 1];
  const used = totalCells(alloc);

  // 1. Power
  const power = batteryAfterAllocation(today.solar, state.battery, used);
  let battery = power.after;

  // 2. Life Support
  let life = state.life + lifeDeltaFromCells(alloc.life);
  if (today.small === 'wear') life -= CONFIG.wearLoss;
  if (today.small === 'harvest') life += CONFIG.harvestGain;
  let coldNight = false;
  if (today.dust) {
    if (battery >= CONFIG.dustNightDraw) battery -= CONFIG.dustNightDraw;
    else {
      coldNight = true;
      life -= CONFIG.coldNightLoss;
    }
  }
  life = Math.max(0, Math.min(CONFIG.lifeMax, life));

  // 3. Radiation
  const d = doseFor(alloc, today.storm);
  const dose = round1(state.dose + d.total);

  // 4. Science
  const scienceGained = alloc.science * CONFIG.sciencePerCell;
  const science = state.science + scienceGained;

  const record: SolRecord = {
    sol: state.sol,
    alloc: { ...alloc },
    solar: today.solar,
    dust: today.dust,
    storm: today.storm,
    forecast: state.commsFunded,
    small: today.small,
    batteryBefore: state.battery,
    batteryAfter: battery,
    chargeLost: power.lost,
    coldNight,
    lifeBefore: state.life,
    lifeAfter: life,
    doseAdded: d.total,
    doseBlocked: d.blocked,
    doseEva: d.eva,
    stormDose: d.storm,
    doseAfter: dose,
    scienceGained,
    scienceAfter: science,
  };

  // 5. Win / lose
  let status: GameState['status'] = 'playing';
  let failReason: GameState['failReason'] = null;
  if (life <= 0) {
    status = 'lost';
    failReason = 'life';
  } else if (dose > CONFIG.doseLimit) {
    status = 'lost';
    failReason = 'radiation';
  } else if (state.sol >= CONFIG.sols) {
    if (science >= CONFIG.scienceGoal) status = 'won';
    else {
      status = 'lost';
      failReason = 'science';
    }
  }

  return {
    ...state,
    sol: status === 'playing' ? state.sol + 1 : state.sol,
    life,
    dose,
    battery,
    science,
    commsFunded: alloc.comms > 0,
    status,
    failReason,
    history: [...state.history, record],
  };
}

// ---- Preview: only uses what the player is allowed to know ----

export type Trend = 'up' | 'down' | 'same';
export interface PreviewLine {
  system: 'life' | 'dose' | 'battery' | 'science' | 'comms';
  trend: Trend;
  /** Is this change good, bad or neutral for the crew? */
  tone: 'good' | 'bad' | 'neutral';
  text: string;
}

export function preview(state: GameState, alloc: Allocation): PreviewLine[] {
  const view = morning(state);
  const lines: PreviewLine[] = [];
  const used = totalCells(alloc);

  // Life Support
  const lifeDelta = lifeDeltaFromCells(alloc.life);
  if (lifeDelta < 0)
    lines.push({
      system: 'life',
      trend: 'down',
      tone: 'bad',
      text: `Life Support goes down by ${-lifeDelta}. It needs ${CONFIG.lifeNeed} cells.`,
    });
  else if (lifeDelta > 0 && view.life < CONFIG.lifeMax)
    lines.push({
      system: 'life',
      trend: 'up',
      tone: 'good',
      text: `Life Support goes up by ${Math.min(lifeDelta, CONFIG.lifeMax - view.life)}.`,
    });
  else if (lifeDelta > 0)
    lines.push({
      system: 'life',
      trend: 'same',
      tone: 'neutral',
      text: 'Life Support is already full. Extra cells here are wasted.',
    });
  else lines.push({ system: 'life', trend: 'same', tone: 'neutral', text: 'Life Support stays steady.' });

  // Radiation
  const known = view.hasForecast ? (view.stormToday ?? null) : null;
  const d = doseFor(alloc, known);
  const shieldPct = Math.round(shieldFraction(alloc.shield) * 100);
  let doseText = `Radiation dose goes up by about ${Math.round(d.total)}`;
  if (!view.hasForecast) doseText += ', or more if a storm hits. You have no forecast today';
  doseText += '.';
  if (alloc.shield > 0) doseText += ` Shield blocks ${shieldPct}%.`;
  if (alloc.shield > CONFIG.shieldMaxCells) doseText += ` Only ${CONFIG.shieldMaxCells} shield cells can help.`;
  if (alloc.science > 0) doseText += ` Working outside adds ${Math.round(d.eva)}.`;
  const overLimit = view.dose + d.total > CONFIG.doseLimit;
  if (overLimit) doseText += ' That is over the safe limit!';
  lines.push({
    system: 'dose',
    trend: 'up',
    tone: overLimit || (known && shieldPct < 40) || d.total > CONFIG.baseDose + 12 ? 'bad' : 'neutral',
    text: doseText,
  });

  // Battery
  const p = batteryAfterAllocation(view.solar, view.battery, used);
  let batteryAfter = p.after;
  let batteryText: string;
  if (batteryAfter > view.battery) batteryText = `Battery charges to ${batteryAfter}.`;
  else if (batteryAfter < view.battery) batteryText = `Battery drops to ${batteryAfter}.`;
  else batteryText = `Battery stays at ${batteryAfter}.`;
  if (p.lost > 0) batteryText += ` ${p.lost} saved ${p.lost === 1 ? 'cell is' : 'cells are'} lost as heat.`;
  let batteryTone: PreviewLine['tone'] = 'neutral';
  if (view.dust) {
    if (batteryAfter >= CONFIG.dustNightDraw) {
      batteryAfter -= CONFIG.dustNightDraw;
      batteryText += ` Heaters use ${CONFIG.dustNightDraw} cell tonight.`;
    } else {
      batteryText += ` Empty battery on a dusty night: Life Support loses ${CONFIG.coldNightLoss}.`;
      batteryTone = 'bad';
    }
  }
  lines.push({
    system: 'battery',
    trend: p.after > view.battery ? 'up' : p.after < view.battery ? 'down' : 'same',
    tone: batteryTone,
    text: batteryText,
  });

  // Science
  const gain = alloc.science * CONFIG.sciencePerCell;
  lines.push(
    gain > 0
      ? { system: 'science', trend: 'up', tone: 'good', text: `Science: +${gain} ${gain === 1 ? 'sample' : 'samples'}.` }
      : { system: 'science', trend: 'same', tone: 'bad', text: 'No science today. The mission needs samples.' },
  );

  // Comms
  if (view.sol < CONFIG.sols)
    lines.push(
      alloc.comms > 0
        ? {
            system: 'comms',
            trend: 'up',
            tone: 'good',
            text:
              alloc.comms > 1
                ? 'Tomorrow you get a forecast. One Comms cell is enough.'
                : 'Tomorrow you get a forecast from Earth.',
          }
        : { system: 'comms', trend: 'down', tone: 'bad', text: 'No Comms: no forecast tomorrow.' },
    );

  return lines;
}

/** Play a whole mission with a strategy function. Used by tests and the balance script. */
export function playMission(
  scenario: Scenario,
  seed: number,
  choose: (view: MorningView) => Allocation,
): GameState {
  let state = newGame(scenario, seed);
  while (state.status === 'playing') state = step(state, choose(morning(state)));
  return state;
}
