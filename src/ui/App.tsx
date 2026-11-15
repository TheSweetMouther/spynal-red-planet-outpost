import { useCallback, useRef, useState } from 'preact/hooks';
import { CACHE_KEY, fallbackNotice, flareAlertNotice, loadRecent, loadSnapshot, type DataStatus, type FetchLike, type LiveCache } from '../data/loader';
import { scenarioFromSnapshot, startDateFor } from '../data/scenarios';
import { randomScenario } from '../sim/events';
import type { GameState, Scenario } from '../sim/state';
import { Debrief } from './Debrief';
import { Game } from './Game';
import { Sources } from './Sources';
import { Teacher } from './Teacher';
import { Title } from './Title';

export type MissionChoice = { kind: 'replay'; id: string } | { kind: 'live' } | { kind: 'random' };

export interface Mission {
  choice: MissionChoice;
  title: string;
  scenario: Scenario;
  seed: number;
  /** null for Random missions (no real data). */
  status: DataStatus | null;
  /** UTC date that sol 1 stands for, in data missions. */
  startDate: string | null;
  marsObserved: boolean;
  tutorial: boolean;
  /** Shown on the first morning report when "Today's Sun" had to use saved data. */
  notice: string | null;
}

type Screen = 'title' | 'game' | 'debrief' | 'sources' | 'teacher';

const browserFetch: FetchLike = (url, init) => fetch(url, init);

/** The last good live download lives in localStorage. Private mode or a full disk must not break the game. */
const browserCache: LiveCache = {
  read() {
    try {
      return localStorage.getItem(CACHE_KEY);
    } catch {
      return null;
    }
  },
  write(value) {
    try {
      localStorage.setItem(CACHE_KEY, value);
    } catch {
      // ignore
    }
  },
};

/** Optional key for api.nasa.gov, set at build time. It ships in the bundle (see README). */
const NASA_API_KEY: string = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY';

export async function buildMission(choice: MissionChoice, seed: number, tutorial: boolean, signal?: AbortSignal): Promise<Mission> {
  if (choice.kind === 'random')
    return {
      choice,
      title: 'Random mission',
      scenario: randomScenario(seed),
      seed,
      status: null,
      startDate: null,
      marsObserved: false,
      tutorial,
      notice: null,
    };
  const loaded =
    choice.kind === 'replay'
      ? await loadSnapshot(choice.id, browserFetch)
      : await loadRecent({ fetchImpl: browserFetch, now: new Date(), apiKey: NASA_API_KEY, cache: browserCache, signal });
  const snap = loaded.snapshot;
  return {
    choice,
    title: choice.kind === 'live' ? (loaded.status.kind === 'live' ? "Today's Sun" : `Today's Sun (saved data: ${snap.window.title})`) : `Real Storm Replay: ${snap.window.title}`,
    scenario: scenarioFromSnapshot(snap, seed),
    seed,
    status: loaded.status,
    startDate: startDateFor(snap, seed),
    marsObserved: Boolean(snap.window.marsObserved),
    tutorial,
    notice: choice.kind === 'live' ? (fallbackNotice(loaded.status) ?? flareAlertNotice(loaded.status)) : null,
  };
}

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [back, setBack] = useState<Screen>('title');
  const [mission, setMission] = useState<Mission | null>(null);
  const [runId, setRunId] = useState(0);
  const [final, setFinal] = useState<GameState | null>(null);
  const [busy, setBusy] = useState<'live' | 'saved' | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (choice: MissionChoice, seed: number, tutorial: boolean) => {
    const ctrl = new AbortController();
    cancelRef.current = ctrl;
    setBusy(choice.kind === 'live' ? 'live' : 'saved');
    setError(null);
    try {
      const m = await buildMission(choice, seed, tutorial, ctrl.signal);
      setMission(m);
      setFinal(null);
      setRunId((n) => n + 1);
      setScreen('game');
      window.scrollTo(0, 0);
    } catch (e) {
      console.warn('Could not start mission', e);
      setError('Could not load the mission data. Check that the game files are complete, or try a Random mission.');
    } finally {
      setBusy(null);
    }
  }, []);

  const open = (s: Screen) => {
    setBack(screen);
    setScreen(s);
    window.scrollTo(0, 0);
  };

  if (screen === 'sources') return <Sources mission={mission} onBack={() => setScreen(back)} />;
  if (screen === 'teacher') return <Teacher onBack={() => setScreen(back)} />;
  if (screen === 'game' && mission)
    return (
      <Game
        key={runId}
        mission={mission}
        onFinish={(state) => {
          setFinal(state);
          setScreen('debrief');
          window.scrollTo(0, 0);
        }}
        onQuit={() => setScreen('title')}
        onSources={() => open('sources')}
      />
    );
  if (screen === 'debrief' && mission && final)
    return (
      <Debrief
        mission={mission}
        state={final}
        onRetry={() => {
          // Same seed, same mission. The tutorial is not repeated.
          setMission({ ...mission, tutorial: false });
          setFinal(null);
          setRunId((n) => n + 1);
          setScreen('game');
          window.scrollTo(0, 0);
        }}
        onNew={() => setScreen('title')}
        onSources={() => open('sources')}
      />
    );
  return <Title busy={busy} error={error} onCancel={() => cancelRef.current?.abort()} onStart={start} onSources={() => open('sources')} onTeacher={() => open('teacher')} />;
}
