import { useEffect, useState } from 'preact/hooks';
import { loadIndex, type SnapshotIndexEntry } from '../data/loader';
import { CONFIG } from '../sim/config';
import type { MissionChoice } from './App';
import { Button, Term } from './components';
import { FACTS } from './copy';
import { Icon } from './icons';
import { isTutorialDone, shouldShowTutorial } from './tutorial';

const newSeed = () => 1000 + Math.floor(Math.random() * 9000);

interface Props {
  /** 'live' while asking NASA, 'saved' while loading bundled files. */
  busy: 'live' | 'saved' | null;
  error: string | null;
  /** Stop waiting for NASA and use saved data. */
  onCancel: () => void;
  onStart: (choice: MissionChoice, seed: number, tutorial: boolean) => void;
  onSources: () => void;
  onTeacher: () => void;
}

export function Title({ busy, error, onCancel, onStart, onSources, onTeacher }: Props) {
  const [index, setIndex] = useState<SnapshotIndexEntry[] | null>(null);
  const [seedText, setSeedText] = useState(() => String(newSeed()));
  // The tutorial shows on the first mission only, unless the player asks to see it again.
  const [tutorialDone] = useState(() => isTutorialDone());
  const [replayTutorial, setReplayTutorial] = useState(false);

  useEffect(() => {
    loadIndex((url) => fetch(url))
      .then(setIndex)
      .catch(() => setIndex([]));
  }, []);

  const seed = Math.max(1, Math.min(999999, Math.floor(Number(seedText)) || 1));
  const go = (choice: MissionChoice) => onStart(choice, seed, shouldShowTutorial(replayTutorial));
  const replays = (index ?? []).filter((e) => e.kind === 'replay');

  return (
    <main class="page title-page">
      <header class="hero">
        <div class="hero-sky" aria-hidden="true" />
        <div class="hero-text">
          <h1>Red Planet Outpost</h1>
          <p class="hero-sub">Junior astronaut mission trainer</p>
          <p class="lead">
            You run a Mars base for {CONFIG.sols} <Term id="sol">sols</Term>. The Sun gives you power, but never enough for everything. Keep your crew
            safe <em>and</em> do the science.
          </p>
        </div>
      </header>

      <ul class="how" aria-label="How to play">
        <li>
          <Icon name="cell" class="tone-solar" />
          <span>Share your power cells between 4 systems each sol.</span>
        </li>
        <li>
          <Icon name="flare" class="tone-alarm" />
          <span>Watch out for <Term id="flare">solar flares</Term> and dust storms.</span>
        </li>
        <li>
          <Icon name="science" class="tone-haze" />
          <span>Collect {CONFIG.scienceGoal} samples. Extra samples earn bonus stars.</span>
        </li>
        <li>
          <Icon name="timer" class="tone-blue" />
          <span>No timer. Take as long as you like to think.</span>
        </li>
      </ul>

      <h2>Choose a mission</h2>
      {error && (
        <p class="alert" role="alert">
          <Icon name="warning" /> {error}
        </p>
      )}
      <div class="missions">
        {replays.map((r) => (
          <article class="mission-card" key={r.id}>
            <span class="badge badge-archived">
              <Icon name="archived" /> Real storm replay
            </span>
            <h3>{r.title.replace(' solar storms', '')}</h3>
            <p>
              Real NASA records, {r.start.slice(8)}–{r.end.slice(8)} {r.title.split(' ')[0].slice(0, 3)}.{r.marsObserved ? ' Also measured at Mars.' : ''}
            </p>
            <Button kind="primary" icon="play" disabled={busy !== null} onClick={() => go({ kind: 'replay', id: r.id })}>
              Play this storm
            </Button>
          </article>
        ))}
        <article class="mission-card">
          <span class="badge badge-live">
            <Icon name="live" /> Live if online
          </span>
          <h3>Today's Sun</h3>
          <p>The Sun's last 10 days. The game asks NASA right now, or uses saved data and tells you.</p>
          <Button kind="primary" icon="play" disabled={busy !== null} onClick={() => go({ kind: 'live' })}>
            Play today's Sun
          </Button>
        </article>
        <article class="mission-card">
          <span class="badge badge-game">
            <Icon name="game" /> Game events
          </span>
          <h3>Random mission</h3>
          <p>Made-up storms, new for every seed. Good for practice. Not real data.</p>
          <Button kind="primary" icon="play" disabled={busy !== null} onClick={() => go({ kind: 'random' })}>
            Play random
          </Button>
        </article>
      </div>
      {busy === 'saved' && (
        <p class="loading" role="status">
          <Icon name="comms" /> Getting your mission ready…
        </p>
      )}
      {busy === 'live' && (
        <div class="asking" role="status" aria-live="polite">
          <div class="asking-box">
            <p class="asking-title">
              <Icon name="comms" class="asking-dish tone-blue" /> Asking NASA about the Sun…
            </p>
            <p class="small">This takes a few seconds. If NASA does not answer, the game uses saved data and tells you.</p>
            <Button kind="primary" autoFocus icon="close" onClick={onCancel}>
              Cancel and use saved data
            </Button>
          </div>
        </div>
      )}

      <section class="options" aria-label="Mission options">
        <label class="field">
          <span>
            Mission seed <span class="small">(same number = same mission, good for a class)</span>
          </span>
          <span class="seed-row">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999999}
              value={seedText}
              onInput={(e) => setSeedText((e.target as HTMLInputElement).value)}
              aria-label="Mission seed number"
            />
            <Button icon="game" onClick={() => setSeedText(String(newSeed()))}>New seed</Button>
          </span>
        </label>
        <p class="tutorial-note">
          {!tutorialDone && 'Your first mission starts with a short tutorial. You can skip it.'}
          {tutorialDone && !replayTutorial && (
            <>
              You have seen the tutorial.{' '}
              <button type="button" class="link-btn" onClick={() => setReplayTutorial(true)}>
                Replay tutorial
              </button>
            </>
          )}
          {tutorialDone && replayTutorial && (
            <>
              <Icon name="ok" class="tone-blue" /> Your next mission will start with the tutorial.{' '}
              <button type="button" class="link-btn" onClick={() => setReplayTutorial(false)}>
                Do not show it
              </button>
            </>
          )}
        </p>
      </section>

      <section class="did-you-know">
        <div>
          <h2>Did you know?</h2>
          <ul>
            <li>
              A <Term id="sol" /> lasts {FACTS.sol_length.display}. Mars turns a little slower than Earth.
            </li>
            <li>
              A radio message from Mars takes {FACTS.light_delay_min.value} to {FACTS.light_delay_max.value} minutes to reach Earth. That is the{' '}
              <Term id="commdelay" />.
            </li>
            <li>
              In 2018, a giant dust storm hid the Sun from the solar-powered Opportunity rover. Its last message came on{' '}
              {FACTS.opportunity_last_contact.value}.
            </li>
            <li>
              At sunset on Mars, the sky around the Sun looks {FACTS.mars_sunset_blue.value}. Fine dust in the air lets blue light through more easily.
            </li>
          </ul>
        </div>
        <figure class="fig">
          <img
            src={`${import.meta.env.BASE_URL}data/images/curiosity-glen-etive.jpg`}
            alt="The Curiosity rover standing on rocky, reddish ground on Mars."
            loading="lazy"
          />
          <figcaption class="small">The Curiosity rover on Mars. Credit: NASA/JPL-Caltech/MSSS</figcaption>
        </figure>
      </section>

      <footer class="foot">
        <Button kind="ghost" icon="search" onClick={onSources}>
          The Science Behind This
        </Button>
        <Button kind="ghost" icon="teacher" onClick={onTeacher}>
          For teachers and parents
        </Button>
        <p class="small">No account. No ads. No tracking. Built for the NASA Space Apps Challenge 2026.</p>
      </footer>
    </main>
  );
}
