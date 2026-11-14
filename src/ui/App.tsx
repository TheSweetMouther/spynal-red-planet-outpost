import { useCallback, useState } from 'preact/hooks';
import { loadRecent, loadSnapshot, type DataStatus, type FetchLike } from '../data/loader';
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
}

type Screen = 'title' | 'game' | 'debrief' | 'sources' | 'teacher';

const browserFetch: FetchLike = (url, init) => fetch(url, init);

export async function buildMission(choice: MissionChoice, seed: number, tutorial: boolean): Promise<Mission> {
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
    };
  const loaded =
    choice.kind === 'replay'
      ? await loadSnapshot(choice.id, browserFetch)
      : await loadRecent({ fetchImpl: browserFetch, now: new Date() });
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
  };
}

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [back, setBack] = useState<Screen>('title');
  const [mission, setMission] = useState<Mission | null>(null);
  const [runId, setRunId] = useState(0);
  const [final, setFinal] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (choice: MissionChoice, seed: number, tutorial: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const m = await buildMission(choice, seed, tutorial);
      setMission(m);
      setFinal(null);
      setRunId((n) => n + 1);
      setScreen('game');
      window.scrollTo(0, 0);
    } catch (e) {
      console.warn('Could not start mission', e);
      setError('Could not load the mission data. Check that the game files are complete, or try a Random mission.');
    } finally {
      setBusy(false);
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
  return <Title busy={busy} error={error} onStart={start} onSources={() => open('sources')} onTeacher={() => open('teacher')} />;
}
