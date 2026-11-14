import { CONFIG } from './config';

export type Severity = 'minor' | 'moderate' | 'severe';
export type SystemId = 'life' | 'shield' | 'comms' | 'science';
export const SYSTEMS: readonly SystemId[] = ['life', 'shield', 'comms', 'science'];

export type Allocation = Record<SystemId, number>;
export const emptyAllocation = (): Allocation => ({ life: 0, shield: 0, comms: 0, science: 0 });
export const totalCells = (a: Allocation) => a.life + a.shield + a.comms + a.science;

/** Where a storm came from, when it is driven by a real DONKI record. */
export interface StormSource {
  /** DONKI flare ID, e.g. "2017-09-10T15:35:00-FLR-001". */
  id: string;
  classType: string;
  /** UTC time of the flare peak (or start). */
  time: string;
  link?: string;
  /** ID of the linked particle event, if any. */
  sepId?: string;
}

export interface Storm {
  severity: Severity;
  /** True when a solar energetic particle (SEP) event is linked. */
  sep: boolean;
  source?: StormSource;
}

export type SmallEvent = 'wear' | 'harvest';

/** What a scenario supplies: the storms for each sol (index 0 = sol 1). */
export interface Scenario {
  id: string;
  storms: (Storm | null)[];
}

/** Everything that will happen on one sol. Hidden from the player until it happens. */
export interface SolPlan {
  solar: number;
  dust: boolean;
  storm: Storm | null;
  small: SmallEvent | null;
}

export type FailReason = 'life' | 'radiation' | 'science';
export type Status = 'playing' | 'won' | 'lost';

export interface SolRecord {
  sol: number;
  alloc: Allocation;
  solar: number;
  dust: boolean;
  storm: Storm | null;
  /** True if the player had a forecast for this sol when they chose. */
  forecast: boolean;
  small: SmallEvent | null;
  batteryBefore: number;
  batteryAfter: number;
  /** Cells lost as heat while charging. */
  chargeLost: number;
  coldNight: boolean;
  lifeBefore: number;
  lifeAfter: number;
  doseAdded: number;
  /** Dose the shield blocked today. */
  doseBlocked: number;
  /** Dose from being outside on EVA. */
  doseEva: number;
  /** Unshielded storm dose today (0 when no storm). */
  stormDose: number;
  doseAfter: number;
  scienceGained: number;
  scienceAfter: number;
}

export interface GameState {
  seed: number;
  scenarioId: string;
  plan: SolPlan[];
  /** Current sol, 1-based. After the last sol it stays at CONFIG.sols. */
  sol: number;
  life: number;
  dose: number;
  battery: number;
  science: number;
  /** Did the player fund Comms on the previous sol? (Sol 1 has a free briefing.) */
  commsFunded: boolean;
  status: Status;
  failReason: FailReason | null;
  history: SolRecord[];
}

/** What the player is allowed to know in the morning. */
export interface MorningView {
  sol: number;
  solsTotal: number;
  solar: number;
  battery: number;
  /** Cells that can be spent today (solar + battery). */
  available: number;
  dust: boolean;
  life: number;
  dose: number;
  science: number;
  /** True if yesterday's Comms (or the sol 1 briefing) gives a forecast today. */
  hasForecast: boolean;
  /** Today's storm, only if `hasForecast`. `null` means "no storm today". */
  stormToday: Storm | null | undefined;
  /** Will tomorrow be a dust-storm sol? Only if `hasForecast`. */
  dustTomorrow: boolean | undefined;
}

export function stormDoseOf(storm: Storm | null): number {
  if (!storm) return 0;
  const base = CONFIG.stormDose[storm.severity];
  return storm.sep ? base * CONFIG.sepMultiplier : base;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
