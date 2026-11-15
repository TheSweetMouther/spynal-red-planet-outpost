import { CONFIG } from '../sim/config';
import { makeRng } from '../sim/rng';
import type { Scenario } from '../sim/state';
import { addDays, mapToSols, type DonkiFlare, type DonkiSep } from './donki-mapping';

/** One saved DONKI download. Written by scripts/fetch-donki.ts. */
export interface DonkiSnapshot {
  window: {
    id: string;
    title: string;
    kind: 'replay' | 'recent';
    /** First and last UTC day covered (YYYY-MM-DD). */
    start: string;
    end: string;
    /** True if spacecraft at Mars also measured this storm. */
    marsObserved?: boolean;
    blurb?: string;
  };
  /** ISO time the data was downloaded from DONKI. */
  fetched_at: string;
  /** Human-readable source of the data. */
  source: string;
  /** Base URL of the API (or archive) the records were downloaded from. */
  source_endpoint?: string;
  /** True when the snapshot is known to be missing events. */
  partial?: boolean;
  /**
   * Where the flares came from. 'FLR' is DONKI's full flare list. 'notifications'
   * means the flare list was down and DONKI's flare alerts were used instead:
   * they only cover flares of class M5.0 and bigger.
   */
  flare_source?: 'FLR' | 'notifications';
  /** Why the full flare list was not used, e.g. "HTTP 404". */
  flr_problem?: string;
  /** Free-text note about how the snapshot was built. */
  note?: string;
  FLR: DonkiFlare[];
  SEP: DonkiSep[];
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Pick the 10-day slice of a snapshot to play. Replay windows are a little
 * longer than 10 days, so the seed slides the start by a few days and event
 * timing changes between runs. Sol 1 is always calm.
 */
export function startDateFor(snap: DonkiSnapshot, seed: number): string {
  const span = daysBetween(snap.window.start, snap.window.end) + 1;
  const slack = Math.max(0, span - CONFIG.sols);
  // "Today's Sun" always plays the most recent 10 days.
  if (snap.window.kind === 'recent') return addDays(snap.window.end, -(CONFIG.sols - 1));
  const offset = makeRng(seed ^ 0x2f6e2b1).int(0, slack);
  return addDays(snap.window.start, offset);
}

export function scenarioFromSnapshot(snap: DonkiSnapshot, seed: number): Scenario {
  const start = startDateFor(snap, seed);
  return { id: snap.window.id, storms: mapToSols(snap.FLR, snap.SEP, start, CONFIG.sols) };
}
