import type { DonkiFlare, DonkiLinked } from './donki-mapping';

// Backup source for flares. DONKI sends a "notification" for every flare of
// class M5.0 or bigger. When DONKI's flare list (FLR) is down, these messages
// still give the class, the peak time and the DONKI flare ID of the big flares.
// Smaller flares (C and small M) are not in the notifications.

/** Smallest flare DONKI sends a notification for. */
export const NOTIFICATION_THRESHOLD = 'M5.0';

export interface DonkiNotification {
  messageType?: string;
  messageID: string;
  messageURL?: string;
  messageIssueTime?: string;
  messageBody: string;
}

/** A CME record, used only for its links to flares. */
export interface DonkiCme {
  activityID: string;
  linkedEvents?: DonkiLinked[] | null;
}

const FLR_ID = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-FLR-\d{3}/;
const field = (body: string, name: string) => new RegExp(`${name}:\\s*([^\\s.]+(?:\\.\\d+)?)`, 'i').exec(body)?.[1];

/** Key that says "same flare", whatever the source: class + peak minute. */
export const flareKey = (f: Pick<DonkiFlare, 'classType' | 'peakTime' | 'beginTime'>) =>
  `${f.classType}@${(f.peakTime ?? f.beginTime ?? '').slice(0, 16)}`;

/**
 * Turn DONKI flare notifications into flare records. Messages that only say
 * "the threshold was crossed" have no class yet and are skipped; the summary
 * message that follows has the class, the peak time and (since 2017) the ID.
 */
export function flaresFromNotifications(list: DonkiNotification[], cmes: DonkiCme[] = []): DonkiFlare[] {
  const out = new Map<string, DonkiFlare>();
  for (const m of list) {
    const body = m.messageBody ?? '';
    const classType = /Flare intensity:\s*([ABCMX]\d+(?:\.\d+)?)/i.exec(body)?.[1];
    const peakTime = field(body, 'Flare peak time');
    if (!classType || !peakTime || !/^\d{4}-\d{2}-\d{2}T/.test(peakTime)) continue;
    const beginTime = field(body, 'Flare start time');
    const id = FLR_ID.exec(body)?.[0];
    // CMEs that DONKI links to this flare let a particle event be traced back to it.
    const linked = id ? cmes.filter((c) => (c.linkedEvents ?? []).some((l) => l.activityID === id)).map((c) => ({ activityID: c.activityID })) : [];
    const flare: DonkiFlare & { fromNotification: string } = {
      flrID: id ?? m.messageID,
      beginTime: beginTime && /^\d{4}-/.test(beginTime) ? beginTime : undefined,
      peakTime,
      classType,
      link: m.messageURL,
      linkedEvents: linked,
      fromNotification: m.messageID,
    };
    out.set(flareKey(flare), flare); // a later, corrected message replaces an earlier one
  }
  return [...out.values()].sort((a, b) => (a.peakTime ?? '').localeCompare(b.peakTime ?? ''));
}

/** Add flares that are not already in `base` (same class and peak minute = same flare). */
export function mergeFlares(base: DonkiFlare[], extra: DonkiFlare[]): DonkiFlare[] {
  const seen = new Set(base.map(flareKey));
  const merged = [...base];
  for (const f of extra) {
    if (seen.has(flareKey(f))) continue;
    seen.add(flareKey(f));
    merged.push(f);
  }
  return merged.sort((a, b) => (a.peakTime ?? a.beginTime ?? '').localeCompare(b.peakTime ?? b.beginTime ?? ''));
}
