import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classToSeverity, flareStrength, isMeasuredSep, linkedSep, mapToSols, type DonkiFlare, type DonkiSep } from '../src/data/donki-mapping';
import { flaresFromNotifications, mergeFlares } from '../src/data/donki-notifications';
import { badgeText, DONKI_NEW, DONKI_OLD, fallbackNotice, flareAlertNotice, loadRecent, parseDonkiArray, readCachedLive, type FetchLike, type LiveCache } from '../src/data/loader';
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

  it('the replay windows contain the well-known big flares', () => {
    const classesOn = (id: string, day: string) =>
      load(id).FLR.filter((f) => (f.peakTime ?? '').startsWith(day)).map((f) => f.classType);
    expect(classesOn('sep2017', '2017-09-06')).toContain('X9.3');
    expect(classesOn('sep2017', '2017-09-10')).toContain('X8.2');
    for (const day of ['2024-05-09', '2024-05-10', '2024-05-11', '2024-05-12', '2024-05-14', '2024-05-15'])
      expect(classesOn('may2024', day).some((c) => c.startsWith('X')), day).toBe(true);
    for (const id of ['sep2017', 'may2024']) {
      const snap = load(id);
      // A snapshot may only call itself complete when the full flare list was downloaded.
      if (snap.flare_source !== 'FLR') expect(snap.partial, id).toBe(true);
      const keys = snap.FLR.map((f) => `${f.classType}@${(f.peakTime ?? '').slice(0, 16)}`);
      expect(new Set(keys).size, id).toBe(keys.length); // no flare listed twice
    }
  });

  it('every replay snapshot gives a 10-sol scenario with real storms for any seed', () => {
    for (const id of ['sep2017', 'may2024']) {
      const snap = load(id);
      // Where and when the records were downloaded is stored and shown on the Science page.
      expect(snap.source_endpoint, id).toMatch(/^https:\/\//);
      expect(snap.fetched_at, id).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Only a direct API download may claim to be complete.
      if (!snap.source_endpoint!.includes('DONKI-API') && !snap.source_endpoint!.includes('api.nasa.gov')) expect(snap.partial, id).toBe(true);
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

  const fail = (status: number) => ({ ok: false as const, status, text: async () => 'error' });
  /** A request that never answers and ignores the abort signal. */
  const hang = () => new Promise<never>(() => {});
  const memoryCache = (initial: string | null = null): LiveCache & { value: string | null } => ({
    value: initial,
    read() {
      return this.value;
    },
    write(v: string) {
      this.value = v;
    },
  });

  it('503 from the new endpoint and 429 from the old one: saved snapshot, ARCHIVED badge, notice', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return fail(503);
      if (url.startsWith(DONKI_OLD)) return fail(429);
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now });
    // Chain order: new endpoint first, then the old one, then the saved files.
    const firstOld = f.calls.findIndex((u) => u.startsWith(DONKI_OLD));
    const firstLocal = f.calls.findIndex((u) => !u.startsWith('http'));
    expect(f.calls[0].startsWith(DONKI_NEW)).toBe(true);
    expect(firstOld).toBeGreaterThan(0);
    expect(firstLocal).toBeGreaterThan(firstOld);
    expect(r.status.kind).toBe('archived');
    expect(r.status.origin).toBe('snapshot');
    expect(r.status.reason).toContain('503');
    expect(r.status.reason).toContain('429');
    expect(badgeText(r.status)).toBe('ARCHIVED DATA · from May 2024');
    expect(fallbackNotice(r.status)).toBe(
      "NASA's server didn't answer right now, so this mission uses saved Sun data from May 2024.",
    );
  });

  it('503 from the new endpoint: the old endpoint is used and the data is LIVE', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return fail(503);
      if (url.startsWith(DONKI_OLD)) return ok('[]');
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now, apiKey: 'MY_TEST_KEY' });
    expect(r.status.kind).toBe('live');
    expect(r.status.source).toBe(DONKI_OLD);
    expect(f.calls.filter((u) => u.startsWith(DONKI_OLD)).every((u) => u.includes('api_key=MY_TEST_KEY'))).toBe(true);
    expect(fallbackNotice(r.status)).toBeNull();
  });

  it('429 from the old endpoint does not matter when the new one works', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return ok('[]');
      if (url.startsWith(DONKI_OLD)) return fail(429);
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now });
    expect(r.status.kind).toBe('live');
    expect(r.status.source).toBe(DONKI_NEW);
  });

  it('a timeout on the new endpoint moves on to the old one', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return hang() as never;
      if (url.startsWith(DONKI_OLD)) return ok('[]');
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now, timeoutMs: 40, hedgeMs: 10 });
    expect(r.status.kind).toBe('live');
    expect(r.status.source).toBe(DONKI_OLD);
  });

  it('does not wait for a hanging first endpoint once the second has answered', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return hang() as never;
      if (url.startsWith(DONKI_OLD)) return ok('[]');
      return local(url);
    });
    const t0 = Date.now();
    const r = await loadRecent({ fetchImpl: f.impl, now, timeoutMs: 4000, hedgeMs: 20 });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.status.kind).toBe('live');
    expect(r.status.source).toBe(DONKI_OLD);
  });

  it('a timeout on the old endpoint (after a 503) falls back to saved data', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return fail(503);
      if (url.startsWith(DONKI_OLD)) return hang() as never;
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now, timeoutMs: 40, hedgeMs: 10 });
    expect(r.status.kind).toBe('archived');
    expect(r.status.reason).toContain(`${DONKI_NEW}: HTTP 503`);
    expect(r.status.reason).toContain(`${DONKI_OLD}: no answer in time`);
    expect(badgeText(r.status)).not.toContain('LIVE');
  });

  it('asks for FLR and SEP at the same time', async () => {
    const f = fake((url) => (url.startsWith('http') ? (hang() as never) : local(url)));
    const pending = loadRecent({ fetchImpl: f.impl, now, timeoutMs: 40, hedgeMs: 1000 });
    await Promise.resolve();
    const kinds = f.calls.filter((u) => u.startsWith(DONKI_NEW)).map((u) => u.slice(DONKI_NEW.length + 1).split('?')[0]);
    expect(kinds).toContain('FLR');
    expect(kinds).toContain('SEP');
    await pending;
  });

  it('with every endpoint hanging, the default settings fall back within 5 seconds', async () => {
    const f = fake((url) => (url.startsWith('http') ? (hang() as never) : local(url)));
    const t0 = Date.now();
    const r = await loadRecent({ fetchImpl: f.impl, now });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(5000);
    expect(r.status.kind).toBe('archived');
    expect(r.status.reason).toContain(`${DONKI_NEW}: no answer in time`);
    expect(r.status.reason).toContain(`${DONKI_OLD}: no answer in time`);
    expect(fallbackNotice(r.status)).toContain("NASA's server didn't answer right now");
  }, 10000);

  it('a good live download is cached, and a later failure uses it as ARCHIVED, never LIVE', async () => {
    const cache = memoryCache();
    const good = fake((url) => (url.startsWith(DONKI_NEW) ? ok(url.includes('/FLR') ? '[{"flrID":"x","classType":"M1.0"}]' : '') : local(url)));
    const first = await loadRecent({ fetchImpl: good.impl, now, cache });
    expect(first.status.kind).toBe('live');
    expect(cache.value).toContain('"flrID":"x"');

    const later = new Date('2026-11-20T10:00:00Z');
    const bad = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return fail(503);
      if (url.startsWith(DONKI_OLD)) return fail(429);
      return local(url);
    });
    const second = await loadRecent({ fetchImpl: bad.impl, now: later, cache });
    expect(second.status.kind).toBe('archived');
    expect(second.status.origin).toBe('cache');
    expect(second.snapshot.FLR).toHaveLength(1);
    expect(bad.calls.some((u) => !u.startsWith('http'))).toBe(false); // the snapshot files were not needed
    const badge = badgeText(second.status);
    expect(badge).toBe('ARCHIVED DATA · fetched 14 Nov 2026');
    expect(badge).not.toContain('LIVE');
    expect(fallbackNotice(second.status)).toBe(
      "NASA's server didn't answer right now, so this mission uses saved Sun data from 14 Nov 2026.",
    );
  });

  it('a broken or blocked cache never stops the mission', async () => {
    const throwing: LiveCache = {
      read() {
        throw new Error('storage blocked');
      },
      write() {
        throw new Error('storage full');
      },
    };
    const bad = fake((url) => (url.startsWith('http') ? fail(503) : local(url)));
    const r = await loadRecent({ fetchImpl: bad.impl, now, cache: throwing });
    expect(r.status.origin).toBe('snapshot');
    const good = fake((url) => (url.startsWith(DONKI_NEW) ? ok('[]') : local(url)));
    expect((await loadRecent({ fetchImpl: good.impl, now, cache: throwing })).status.kind).toBe('live');
    expect(readCachedLive(memoryCache('not json'))).toBeNull();
    expect(readCachedLive(memoryCache('{"FLR":"nope"}'))).toBeNull();
  });

  it('Cancel goes straight to saved data and says so', async () => {
    const f = fake((url) => (url.startsWith('http') ? (hang() as never) : local(url)));
    const ctrl = new AbortController();
    const pending = loadRecent({ fetchImpl: f.impl, now, signal: ctrl.signal });
    const t0 = Date.now();
    ctrl.abort();
    const r = await pending;
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.status.kind).toBe('archived');
    expect(r.status.cancelled).toBe(true);
    expect(fallbackNotice(r.status)).toBe('You skipped the wait, so this mission uses saved Sun data from May 2024.');
  });

  const alertBody = (cls: string, peak: string, id: string) =>
    `## Summary:\n\nSignificant flare detected by GOES.\n\nFlare start time: 2026-11-10T08:00Z.\n\nFlare peak time: ${peak}.\n\nFlare intensity: ${cls} class.\n\nActivity ID: ${id}.`;

  it('flare list 404 but SEP and flare alerts work: LIVE, with big flares from the alerts and a notice', async () => {
    const alerts = [
      { messageType: 'FLR', messageID: '20261110-AL-001', messageURL: 'https://example.test/1', messageBody: 'Flare intensity has crossed the threshold of M5.0.\n\nFlare M5.0 crossing time: 2026-11-10T08:10Z.' },
      { messageType: 'FLR', messageID: '20261110-AL-002', messageURL: 'https://example.test/2', messageBody: alertBody('X1.4', '2026-11-10T08:20Z', '2026-11-10T08:00:00-FLR-001') },
    ];
    const cmes = [{ activityID: '2026-11-10T08:40:00-CME-001', linkedEvents: [{ activityID: '2026-11-10T08:00:00-FLR-001' }] }];
    const seps = [{ sepID: '2026-11-10T10:00:00-SEP-001', instruments: [{ displayName: 'GOES-P: SEM/EPS >10 MeV' }], linkedEvents: [{ activityID: '2026-11-10T08:40:00-CME-001' }] }];
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return fail(503);
      if (url.startsWith(`${DONKI_OLD}/FLR`)) return fail(404);
      if (url.startsWith(`${DONKI_OLD}/SEP`)) return ok(JSON.stringify(seps));
      if (url.startsWith(`${DONKI_OLD}/notifications`)) return ok(JSON.stringify(alerts));
      if (url.startsWith(`${DONKI_OLD}/CME`)) return ok(JSON.stringify(cmes));
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now });
    expect(r.status.kind).toBe('live');
    expect(r.status.flareSource).toBe('notifications');
    expect(r.status.partial).toBe(true);
    expect(r.status.reason).toContain('404');
    expect(badgeText(r.status)).toBe('LIVE · fetched 14 Nov 2026 08:30 UTC');
    expect(r.snapshot.FLR).toHaveLength(1); // the "threshold crossed" message has no class yet
    expect(r.snapshot.FLR[0]).toMatchObject({ flrID: '2026-11-10T08:00:00-FLR-001', classType: 'X1.4', peakTime: '2026-11-10T08:20Z' });
    // The alert flare is linked to the particle event through the shared CME.
    const storms = mapToSols(r.snapshot.FLR, r.snapshot.SEP, '2026-11-05', 10);
    expect(storms[5]).toMatchObject({ severity: 'severe', sep: true });
    expect(fallbackNotice(r.status)).toBeNull();
    expect(flareAlertNotice(r.status)).toContain('only cover big flares (class M5.0 and up)');
  });

  it('flare list and flare alerts both fail: saved data, never LIVE', async () => {
    const f = fake((url) => {
      if (url.startsWith(DONKI_NEW)) return fail(503);
      if (url.startsWith(`${DONKI_OLD}/SEP`) || url.startsWith(`${DONKI_OLD}/CME`)) return ok('[]');
      if (url.startsWith(DONKI_OLD)) return fail(404);
      return local(url);
    });
    const r = await loadRecent({ fetchImpl: f.impl, now });
    expect(r.status.kind).toBe('archived');
    expect(r.status.reason).toContain(`${DONKI_OLD}: HTTP 404`);
    expect(flareAlertNotice({ ...r.status, flareSource: undefined })).toBeNull();
  });

  it('merges alert flares with archived records without doubling a flare', () => {
    const archived: DonkiFlare[] = [{ flrID: '2017-09-06T11:53:00-FLR-001', classType: 'X9.3', peakTime: '2017-09-06T12:02Z' }];
    const fromAlerts = flaresFromNotifications([
      { messageID: 'a', messageBody: alertBody('X9.3', '2017-09-06T12:02Z', '2017-09-06T11:54:00-FLR-001') },
      { messageID: 'b', messageBody: alertBody('X2.2', '2017-09-06T09:10Z', '2017-09-06T09:03:00-FLR-001') },
    ]);
    const merged = mergeFlares(archived, fromAlerts);
    expect(merged.map((x) => x.classType)).toEqual(['X2.2', 'X9.3']);
    expect(merged[1].flrID).toBe('2017-09-06T11:53:00-FLR-001'); // the archived record is kept
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
