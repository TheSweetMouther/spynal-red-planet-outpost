import type { Severity, Storm } from '../sim/state';

// DONKI -> game mapping. Documented for players on the Sources page:
//   flare class C -> minor, M -> moderate, X -> severe (A and B flares are ignored)
//   a linked, measured SEP (solar energetic particle) event -> radiation spike
// One Earth day of data becomes one game sol; the strongest flare of the day wins.

export interface DonkiLinked {
  activityID: string;
}
export interface DonkiFlare {
  flrID: string;
  beginTime?: string;
  peakTime?: string;
  classType: string;
  link?: string;
  linkedEvents?: DonkiLinked[] | null;
}
export interface DonkiSep {
  sepID: string;
  eventTime?: string;
  link?: string;
  /** API format: list of instruments that saw the event. */
  instruments?: { displayName: string }[] | null;
  /** Archived-page format: one instrument name. */
  instrument?: string;
  linkedEvents?: DonkiLinked[] | null;
}

export function classToSeverity(classType: string): Severity | null {
  const letter = (classType ?? '').trim().charAt(0).toUpperCase();
  if (letter === 'X') return 'severe';
  if (letter === 'M') return 'moderate';
  if (letter === 'C') return 'minor';
  return null;
}

/** Bigger number = stronger flare. "X9.3" -> 4_009.3, "M5.5" -> 3_005.5. */
export function flareStrength(classType: string): number {
  const letter = (classType ?? '').trim().charAt(0).toUpperCase();
  const rank = 'ABCMX'.indexOf(letter);
  const mag = parseFloat((classType ?? '').slice(1));
  return rank < 0 ? -1 : rank * 1000 + (Number.isFinite(mag) ? mag : 0);
}

/**
 * DONKI also stores model *forecasts* of particle events (instrument names
 * starting with "MODEL:"). Only measured events count as a radiation spike.
 */
export function isMeasuredSep(sep: DonkiSep): boolean {
  const names = [sep.instrument ?? '', ...(sep.instruments ?? []).map((i) => i.displayName)].filter(Boolean);
  if (names.length === 0) return true;
  return names.some((n) => !n.trim().toUpperCase().startsWith('MODEL'));
}

const ids = (list?: DonkiLinked[] | null) => (list ?? []).map((l) => l.activityID);

/**
 * Find the SEP event linked to a flare, if any. DONKI links events in a chain
 * (flare -> CME <- SEP), so we accept a direct link in either direction or a
 * shared linked event.
 */
export function linkedSep(flare: DonkiFlare, seps: DonkiSep[]): DonkiSep | null {
  const flareLinks = ids(flare.linkedEvents);
  for (const sep of seps) {
    const sepLinks = ids(sep.linkedEvents);
    if (flareLinks.includes(sep.sepID)) return sep;
    if (sepLinks.includes(flare.flrID)) return sep;
    if (sepLinks.some((id) => flareLinks.includes(id))) return sep;
  }
  return null;
}

const dayOf = (iso: string) => iso.slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Map real flares onto game sols. `startDate` (YYYY-MM-DD, UTC) becomes sol 1.
 * Sol 1 is always kept calm so the tutorial sol is safe.
 */
export function mapToSols(
  flares: DonkiFlare[],
  seps: DonkiSep[],
  startDate: string,
  sols: number,
): (Storm | null)[] {
  const measured = seps.filter(isMeasuredSep);
  const out: (Storm | null)[] = [];
  for (let i = 0; i < sols; i++) {
    const day = addDays(startDate, i);
    const todays = flares
      .filter((f) => dayOf(f.peakTime ?? f.beginTime ?? '') === day && classToSeverity(f.classType))
      .sort((a, b) => flareStrength(b.classType) - flareStrength(a.classType));
    if (i === 0 || todays.length === 0) {
      out.push(null);
      continue;
    }
    // A particle event linked to any flare that day makes the day a spike.
    let best = todays[0];
    let sep: DonkiSep | null = null;
    for (const f of todays) {
      const s = linkedSep(f, measured);
      if (s) {
        sep = s;
        best = f;
        break;
      }
    }
    out.push({
      severity: classToSeverity(best.classType)!,
      sep: Boolean(sep),
      source: {
        id: best.flrID,
        classType: best.classType,
        time: best.peakTime ?? best.beginTime ?? day,
        link: best.link,
        sepId: sep?.sepID,
      },
    });
  }
  return out;
}
