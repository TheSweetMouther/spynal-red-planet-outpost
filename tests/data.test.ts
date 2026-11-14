import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classToSeverity, flareStrength, isMeasuredSep, linkedSep, mapToSols, type DonkiFlare, type DonkiSep } from '../src/data/donki-mapping';
import { badgeText, DONKI_NEW, DONKI_OLD, loadRecent, parseDonkiArray, type FetchLike } from '../src/data/loader';
import { scenarioFromSnapshot, startDateFor, type DonkiSnapshot } from '../src/data/scenarios';
import facts from '../src/data/facts.json';
import { CONFIG } from '../src/sim/config';

const flare = (id: string, peak: string, cls: string, links: string[] = []): DonkiFlare => ({
  flrID: id,
  peakTime: peak,
  classType: cls,
  linkedEvents: links.map((activityID) => ({ activityID })),
});

describe('DONKI event mapping', () => {
  it('maps flare class to severity', () => {
    expect(classToSeverity('C3.0')).toBe('minor');
    expect(classToSeverity('M5.5')).toBe('moderate');
    expect(classToSeverity('X9.3')).toBe('severe');
    expect(classToSeverity('B7.1')).toBeNull();
    expect(classToSeverity('')).toBeNull();
  });

  it('ranks flares by strength', () => {
    expect(flareStrength('X1.0')).toBeGreaterThan(flareStrength('M9.9'));
    expect(flareStrength('M5.5')).toBeGreaterThan(flareStrength('M1.2'));
  });

  it('finds a linked particle event directly or through a shared CME', () => {
    const f = flare('F1', '2017-09-10T16:06Z', 'X8.2', ['CME1']);
    const direct: DonkiSep = { sepID: 'S1', linkedEvents: [{ activityID: 'F1' }] };
    const shared: DonkiSep = { sepID: 'S2', linkedEvents: [{ activityID: 'CME1' }] };
    const other: DonkiSep = { sepID: 'S3', linkedEvents: [{ activityID: 'CME9' }] };
    expect(linkedSep(f, [other, direct])?.sepID).toBe('S1');
    expect(linkedSep(f, [shared])?.sepID).toBe('S2');
    expect(linkedSep(f, [other])).toBeNull();
  });

  it('ignores model forecasts of particle events', () => {
    expect(isMeasuredSep({ sepID: 'a', instrument: 'MODEL: REleASE:SOHO/EPHIN 15.8-39.8 MeV' })).toBe(false);
    expect(isMeasuredSep({ sepID: 'b', instrument: 'GOES13: SEM/EPS >10 MeV' })).toBe(true);
    expect(isMeasuredSep({ sepID: 'c', instruments: [{ displayName: 'MODEL: X' }, { displayName: 'SOHO: COSTEP' }] })).toBe(true);
  });

  it('one day becomes one sol; strongest flare wins; sol 1 stays calm', () => {
    const flares = [
      flare('A', '2024-01-01T05:00Z', 'X1.0'),
      flare('B', '2024-01-02T05:00Z', 'C2.0'),
      flare('C', '2024-01-02T09:00Z', 'M3.0'),
      flare('D', '2024-01-04T09:00Z', 'B9.0'),
      flare('E', '2024-01-05T09:00Z', 'M1.0', ['S']),
    ];
    const seps: DonkiSep[] = [{ sepID: 'S', instrument: 'GOES' }];
    const sols = mapToSols(flares, seps, '2024-01-01', 6);
    expect(sols[0]).toBeNull();
    expect(sols[1]).toMatchObject({ severity: 'moderate', sep: false, source: { id: 'C' } });
    expect(sols[2]).toBeNull();
    expect(sols[3]).toBeNull();
    expect(sols[4]).toMatchObject({ severity: 'moderate', sep: true, source: { id: 'E', sepId: 'S' } });
    expect(sols[5]).toBeNull();
  });
});

describe('saved snapshots', () => {
  const load = (id: string) => JSON.parse(readFileSync(`public/data/donki/${id}.json`, 'utf8')) as DonkiSnapshot;

  it('September 2017 has the real X8.2 flare with a linked particle event', () => {
    const snap = load('sep2017');
    expect(snap.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const x82 = snap.FLR.find((f) => f.flrID === '2017-09-10T15:35:00-FLR-001');
    expect(x82?.classType).toBe('X8.2');
    const storms = mapToSols(snap.FLR, snap.SEP, '2017-09-03', 10);
    expect(storms[7]).toMatchObject({ severity: 'severe', sep: true });
  });

  it('every replay snapshot gives a 10-sol scenario with real storms for any seed', () => {
    for (const id of ['sep2017', 'may2024']) {
      const snap = load(id);
      for (const seed of [1, 2, 3, 99]) {
        const start = startDateFor(snap, seed);
        expect(start >= snap.window.start).toBe(true);
        const sc = scenarioFromSnapshot(snap, seed);
        expect(sc.storms).toHaveLength(CONFIG.sols);
        expect(sc.storms.filter(Boolean).length).toBeGreaterThan(0);
        expect(sc.storms.filter(Boolean).every((s) => s!.source?.id.includes('-FLR-'))).toBe(true);
      }
    }
  });
});

describe('data fallback chain', () => {
  const now = new Date('2026-11-14T08:30:00Z');
  const snapshot: DonkiSnapshot = {
    window: { id: 'may2024', title: 'May 2024', kind: 'replay', start: '2024-05-09', end: '2024-05-20' },
    fetched_at: '2026-11-14T07:00:00.000Z',
    source: 'saved',
    FLR: [],
    SEP: [],
  };
  const index = [{ id: 'may2024', file: 'may2024.json', kind: 'replay', title: 'May 2024', start: '2024-05-09', end: '2024-05-20', fetched_at: snapshot.fetched_at }];
  const ok = (body: string) => ({ ok: true, status: 200, text: async () => body });
  const local = (url: string) => (url.endsWith('index.json') ? ok(JSON.stringify(index)) : ok(JSON.stringify(snapshot)));

  function fake(handler: (url: string) => ReturnType<typeof ok> | { ok: false; status: number; text: () => Promise<string> }) {
    const calls: string[] = [];
    const impl: FetchLike = async (url) => {
      calls.push(url);
      return handler(url);
    };
    return { impl, calls };
  }

  it('uses the new endpoint when it works, and says LIVE', async () => {
    const f = fake((url) => (url.startsWith(DONKI_NEW) ? ok(url.includes('/FLR') ? '[{"flrID":"x","classType":"M1.0"}]' : '') : local(url)));
    const r = await loadRecent({ fetchImpl: f.impl, now });
    expect(r.status.kind).toBe('live');
    expect(r.status.source).toBe(DONKI_NEW);
    expect(r.snapshot.FLR).toHaveLength(1);
    expect(r.snapshot.SEP).toEqual([]);
    expect(f.calls.every((u) => u.startsWith(DONKI_NEW))).toBe(true);
    expect(badgeText(r.status)).toBe('LIVE · fetched 14 Nov 2026 08:30 UTC');
  });

  it('falls back to the old endpoint when the new one fails', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) throw new Error('network down');
      if (url.startsWith(DONKI_OLD)) return ok('[]');
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now });
    expect(r.status.kind).toBe('live');
    expect(r.status.source).toBe(DONKI_OLD);
    expect(f.calls.some((u) => u.includes('api_key=DEMO_KEY'))).toBe(true);
  });

  it('falls back to the saved snapshot and says ARCHIVED, never LIVE', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return ok('<html>We moved</html>'); // a web page, not data
      if (url.startsWith(DONKI_OLD)) return { ok: false, status: 429, text: async () => 'rate limited' };
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now });
    expect(r.status.kind).toBe('archived');
    expect(r.status.reason).toContain('429');
    expect(r.snapshot.window.id).toBe('may2024');
    const badge = badgeText(r.status);
    expect(badge).toBe('ARCHIVED DATA · from May 2024');
    expect(badge).not.toContain('LIVE');
  });

  it('rejects HTML and non-list answers', () => {
    expect(() => parseDonkiArray('<!doctype html>')).toThrow();
    expect(() => parseDonkiArray('{"error":"x"}')).toThrow();
    expect(parseDonkiArray('')).toEqual([]);
  });
});

describe('facts.json', () => {
  it('every fact has a value, unit, source and is verified', () => {
    const all = Object.entries({ ...facts.facts, ...facts.cards }) as [string, Record<string, unknown>][];
    expect(all.length).toBeGreaterThan(15);
    for (const [key, f] of all) {
      expect(f.source_title, key).toBeTruthy();
      expect(String(f.source_url), key).toMatch(/^https:\/\//);
      expect(f.verified, key).toBe(true);
    }
    for (const [key, f] of Object.entries(facts.facts) as [string, Record<string, unknown>][]) {
      expect(f.value, key).toBeDefined();
      expect(f.unit, key).toBeTruthy();
    }
  });

  it('game constants match the facts they are scaled from', () => {
    expect(CONFIG.doseLimit).toBe(facts.facts.career_limit.value);
    const perSol = facts.facts.mars_surface_dose_eq.value * (24 * 60 + 39.6) / (24 * 60);
    expect(CONFIG.baseDose).toBe(Math.round(perSol * CONFIG.solScale));
  });
});
