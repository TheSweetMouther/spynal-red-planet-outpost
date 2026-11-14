import { useEffect, useRef, useState } from 'preact/hooks';
import { addDays } from '../data/donki-mapping';
import { CONFIG } from '../sim/config';
import { nightNote, stormName } from '../sim/debrief';
import { emptyAllocation, SYSTEMS, totalCells, type Allocation, type GameState, type SolRecord, type Storm, type SystemId } from '../sim/state';
import { morning, newGame, preview, step, type PreviewLine } from '../sim/step';
import type { Mission } from './App';
import { Button, DataBadge, Meter, SourceLink, Term } from './components';
import { FACTS, KID_DELAY_LINE, SYSTEM_INFO } from './copy';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const niceDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

interface Props {
  mission: Mission;
  onFinish: (state: GameState) => void;
  onQuit: () => void;
  onSources: () => void;
}

type DropTarget = SystemId | 'tray';

/** Where the real data for a storm came from, or a clear "game event" label. */
export function StormSource({ storm, mission }: { storm: Storm; mission: Mission }) {
  if (!storm.source)
    return <p class="event-source">🎲 Game event. This storm was made up by the game, not taken from real data.</p>;
  const s = storm.source;
  return (
    <p class="event-source">
      📊 <strong>Real data:</strong> <Term id="flare">solar flare</Term> class <strong>{s.classType}</strong>, seen on{' '}
      {niceDate(s.time)} (NASA DONKI record{' '}
      {s.link ? <SourceLink href={s.link}>{s.id}</SourceLink> : s.id}).
      {storm.sep && ' A linked particle event was measured too.'}{' '}
      {mission.marsObserved
        ? 'NASA spacecraft at Mars also measured storms in this period. The game imagines how this one would feel at your outpost.'
        : 'This flare was seen from Earth. The game imagines it reaching Mars.'}
    </p>
  );
}

const TUTORIAL = [
  'Welcome, Commander! Each ⚡ is one power cell. Tap + on a system to give it a cell. You can also drag cells.',
  `First, keep the crew alive. Give ❤️ Life Support ${CONFIG.lifeNeed} cells.`,
  'Now give 📡 Comms 1 cell. Then Earth can send you tomorrow\'s space weather.',
  'Put the other cells where you like. 🔬 Science collects samples. 🛡️ Shielding blocks radiation. Cells you leave here charge the 🔋 battery. Read "What will happen" to see your choice.',
  'Ready? Press "End sol" to see what happens.',
];

export function Game({ mission, onFinish, onQuit, onSources }: Props) {
  const [game, setGame] = useState<GameState>(() => newGame(mission.scenario, mission.seed));
  const [alloc, setAlloc] = useState<Allocation>(emptyAllocation);
  const [night, setNight] = useState<SolRecord | null>(null);
  const [tut, setTut] = useState<number | null>(mission.tutorial ? 0 : null);
  const [drag, setDrag] = useState<{ from: DropTarget; x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const view = morning(game);
  const used = totalCells(alloc);
  const free = view.available - used;
  const freeSolar = Math.max(0, view.solar - used);
  const freeBattery = free - freeSolar;
  const lines = preview(game, alloc);
  const today = game.plan[game.sol - 1];
  const dataDate = mission.startDate ? addDays(mission.startDate, game.sol - 1) : null;

  // Tutorial steps move on by themselves when the player does the thing.
  useEffect(() => {
    if (tut === 1 && alloc.life >= CONFIG.lifeNeed) setTut(2);
    else if (tut === 2 && alloc.comms >= 1) setTut(3);
  }, [tut, alloc]);

  const move = (from: DropTarget, to: DropTarget) => {
    if (from === to) return;
    const next = { ...alloc };
    if (from !== 'tray') {
      if (next[from] <= 0) return;
      next[from]--;
    } else if (free <= 0) {
      setAnnounce('No cells left. Take one out of another system first.');
      return;
    }
    if (to !== 'tray') next[to]++;
    setAlloc(next);
    const name = (t: DropTarget) => (t === 'tray' ? 'the tray' : SYSTEM_INFO[t].name);
    setAnnounce(`Moved 1 cell from ${name(from)} to ${name(to)}.`);
  };

  // Pointer drag (works with mouse, touch and pen).
  const startDrag = (from: DropTarget) => (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    setDrag({ from, x: e.clientX, y: e.clientY });
  };
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const onUp = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]') as HTMLElement | null;
      const to = el?.dataset.drop as DropTarget | undefined;
      if (to) move(drag.from, to);
      setDrag(null);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
    };
  });

  const endSol = () => {
    const next = step(game, alloc);
    setGame(next);
    setNight(next.history[next.history.length - 1]);
    setTut(null);
  };

  const nextSol = () => {
    if (game.status !== 'playing') {
      onFinish(game);
      return;
    }
    setNight(null);
    setAlloc(emptyAllocation());
    window.scrollTo(0, 0);
    setTimeout(() => headingRef.current?.focus(), 0);
  };

  const lifeLevel = game.life > 60 ? 'ok' : game.life > 30 ? 'warn' : 'danger';
  const doseLeft = CONFIG.doseLimit - game.dose;
  const doseLevel = doseLeft > 200 ? 'ok' : doseLeft > 90 ? 'warn' : 'danger';
  const batteryLevel = game.battery >= 2 ? 'ok' : game.battery === 1 ? 'warn' : today.dust ? 'danger' : 'warn';

  const header = (
    <header class="game-head">
      <div>
        <h1 tabIndex={-1} ref={headingRef}>
          {night ? '🌙' : '🌅'} <Term id="sol">Sol</Term> {night ? night.sol : game.sol} of {CONFIG.sols}
        </h1>
        <p class="small">
          {mission.title} · Seed <strong>{mission.seed}</strong>
        </p>
      </div>
      <div class="head-right">
        <DataBadge status={mission.status} />
        <div class="head-links">
          <Button kind="ghost" onClick={onSources}>🔎 Science</Button>
          <Button kind="ghost" onClick={onQuit}>✖ Quit</Button>
        </div>
      </div>
    </header>
  );

  const meters = (
    <section class="meters" aria-label="Crew status">
      <Meter
        icon="❤️"
        label="Life Support"
        value={game.life}
        max={CONFIG.lifeMax}
        level={lifeLevel}
        text={`${game.life} of ${CONFIG.lifeMax}. Air, water and food.`}
      />
      <Meter
        icon="☢️"
        kind="meter-dose"
        label={<Term id="dose">Radiation dose</Term>}
        value={game.dose}
        max={CONFIG.doseLimit}
        level={doseLevel}
        text={`${Math.round(game.dose)} of ${CONFIG.doseLimit} mSv. Stay under the limit.`}
      />
      <Meter
        icon="🔋"
        label="Battery"
        value={game.battery}
        max={CONFIG.batteryMax}
        level={batteryLevel}
        text={`${game.battery} of ${CONFIG.batteryMax} cells stored.`}
      />
      <div class="goal" aria-label="Mission goal">
        <div class="goal-head">
          <span aria-hidden="true">🔬</span> Mission goal: samples
        </div>
        <div class="goal-dots" role="img" aria-label={`${game.science} of ${CONFIG.scienceGoal} samples collected`}>
          {Array.from({ length: CONFIG.scienceGoal }, (_, i) => (
            <span key={i} class={i < game.science ? 'dot dot-on' : 'dot'}>{i < game.science ? '●' : '○'}</span>
          ))}
        </div>
        <div class="meter-text">
          {game.science} of {CONFIG.scienceGoal} collected{game.science >= CONFIG.scienceGoal ? '. Goal reached! ✓' : '.'}
        </div>
      </div>
    </section>
  );

  // ---------- Night screen ----------
  if (night) {
    const note = nightNote(night);
    const over = game.status !== 'playing';
    return (
      <main class="page game-page">
        {header}
        {meters}
        <section class="night panel" aria-live="polite">
          <h2>
            <span aria-hidden="true">{note.icon}</span> {note.title}
          </h2>
          <p class="night-text">{note.text}</p>
          {night.storm && <StormSource storm={night.storm} mission={mission} />}
          <ul class="changes">
            <li>❤️ Life Support: {night.lifeBefore} → <strong>{night.lifeAfter}</strong></li>
            <li>
              ☢️ Dose: +{Math.round(night.doseAdded)} mSv → <strong>{Math.round(night.doseAfter)}</strong> of {CONFIG.doseLimit}
            </li>
            <li>🔋 Battery: {night.batteryBefore} → <strong>{night.batteryAfter}</strong> cells</li>
            <li>🔬 Samples: +{night.scienceGained} → <strong>{night.scienceAfter}</strong> of {CONFIG.scienceGoal}</li>
          </ul>
          <Button kind="primary" autoFocus onClick={nextSol}>
            {over ? '📋 See mission debrief' : `▶ Start sol ${game.sol}`}
          </Button>
        </section>
      </main>
    );
  }

  // ---------- Morning + planning ----------
  const storm = view.hasForecast ? view.stormToday : undefined;
  return (
    <main class="page game-page">
      {header}
      {meters}

      <div class="columns">
        <section class="panel report" aria-label="Morning report">
          <h2>Morning report</h2>
          <ul class="report-list">
            <li>
              {view.dust ? (
                <>
                  <span aria-hidden="true">🌫️</span> <strong>Dust storm!</strong> The panels made only {view.solar} power cells today.
                </>
              ) : (
                <>
                  <span aria-hidden="true">☀️</span> Clear sky. The solar panels made <strong>{view.solar}</strong> power cells.
                </>
              )}
            </li>
            <li>
              <span aria-hidden="true">🔋</span> The battery holds <strong>{view.battery}</strong>{' '}
              {view.battery === 1 ? 'cell' : 'cells'}. You can spend {view.available} today.
            </li>
            {view.hasForecast && storm && (
              <li class="warn-line">
                <span aria-hidden="true">⚠️</span> <strong>Warning from Earth:</strong> a {stormName({ storm })} arrives{' '}
                <strong>today</strong>. Power the <Term id="shielding">shielding</Term>!
                <StormSource storm={storm} mission={mission} />
              </li>
            )}
            {view.hasForecast && !storm && (
              <li>
                <span aria-hidden="true">✅</span> Forecast from Earth: no solar storm today.
              </li>
            )}
            {view.hasForecast && view.dustTomorrow && !view.dust && (
              <li class="warn-line">
                <span aria-hidden="true">🌫️</span> <strong>Dust storm tomorrow.</strong> Save some cells in the battery.
              </li>
            )}
            {view.hasForecast && view.dust && (
              <li>
                <span aria-hidden="true">🌫️</span>{' '}
                {view.dustTomorrow ? 'More dust tomorrow. Keep the battery charged for the heaters.' : 'The dust should clear tomorrow.'}
              </li>
            )}
            {!view.hasForecast && (
              <li class="warn-line">
                <span aria-hidden="true">❓</span> <strong>No forecast today.</strong> Comms had no power yesterday, so no
                message came from Earth. A storm could be a surprise.
              </li>
            )}
            {view.dust && today.dust && game.sol > 1 && !game.plan[game.sol - 2].dust && (
              <li class="fact-line">
                <span aria-hidden="true">📖</span> True story: in 2018 a dust storm covered Mars. The Opportunity rover ran on
                solar power. It sent its last message on {FACTS.opportunity_last_contact.value}.
                <figure class="fig">
                  <img
                    src={`${import.meta.env.BASE_URL}data/images/opportunity-dark-sky.jpg`}
                    alt="Five drawings of the Sun in the Mars sky. From left to right the sky gets darker until the Sun almost disappears."
                    width="640"
                    height="426"
                    loading="lazy"
                  />
                  <figcaption class="small">How the Sun looked to Opportunity as the 2018 dust storm grew (simulated). Credit: NASA/JPL-Caltech/TAMU</figcaption>
                </figure>
              </li>
            )}
            {game.sol === 1 && (
              <li class="fact-line">
                <span aria-hidden="true">📡</span> <Term id="commdelay">Comm delay</Term>: {KID_DELAY_LINE} In this game, an
                answer from Earth arrives the next sol.
              </li>
            )}
            {dataDate && (
              <li class="small">
                Sun data for this sol: {niceDate(dataDate)}.
              </li>
            )}
          </ul>
        </section>

        <section class="panel plan" aria-label="Share out the power">
          <h2>Share out the power</h2>
          {tut !== null && (
            <div class="coach" role="status">
              <p>
                <strong>Step {tut + 1} of {TUTORIAL.length}.</strong> {TUTORIAL[tut]}
              </p>
              <div class="coach-btns">
                {(tut === 0 || tut === 3) && (
                  <Button kind="primary" onClick={() => setTut(tut + 1)}>Got it ▶</Button>
                )}
                <Button kind="ghost" onClick={() => setTut(null)}>Skip the tutorial</Button>
              </div>
            </div>
          )}

          <div class={`tray${drag ? ' drop-ready' : ''}`} data-drop="tray">
            <div class="tray-head">
              <strong>
                ⚡ {free} {free === 1 ? 'cell' : 'cells'} left
              </strong>
              <span class="small"> Sun cells left here charge the battery. Every 3rd saved cell is lost as heat.</span>
            </div>
            <div class="tokens">
              {Array.from({ length: freeSolar }, (_, i) => (
                <span key={`s${i}`} class="token token-sun" onPointerDown={startDrag('tray')} title="Power cell from the Sun">
                  <span aria-hidden="true">☀️</span>
                </span>
              ))}
              {Array.from({ length: freeBattery }, (_, i) => (
                <span key={`b${i}`} class="token token-batt" onPointerDown={startDrag('tray')} title="Power cell from the battery">
                  <span aria-hidden="true">🔋</span>
                </span>
              ))}
              {free === 0 && <span class="small">All cells are in use.</span>}
            </div>
          </div>

          <div class="bins">
            {SYSTEMS.map((sys) => {
              const info = SYSTEM_INFO[sys];
              const n = alloc[sys];
              const hint = (tut === 1 && sys === 'life') || (tut === 2 && sys === 'comms');
              return (
                <div
                  key={sys}
                  class={`bin bin-${sys}${drag ? ' drop-ready' : ''}${hint ? ' bin-hint' : ''}`}
                  data-drop={sys}
                  role="group"
                  aria-label={`${info.name}: ${n} ${n === 1 ? 'cell' : 'cells'}`}
                >
                  <div class="bin-head">
                    <span class="bin-icon" aria-hidden="true">{info.icon}</span>
                    <div>
                      <div class="bin-name">{info.name}</div>
                      <div class="small">{info.short}</div>
                    </div>
                    <div class="bin-count" aria-hidden="true">{n}</div>
                  </div>
                  <div class="tokens bin-tokens">
                    {Array.from({ length: n }, (_, i) => (
                      <span key={i} class="token token-in" onPointerDown={startDrag(sys)}>
                        <span aria-hidden="true">⚡</span>
                      </span>
                    ))}
                  </div>
                  <div class="bin-btns">
                    <button
                      type="button"
                      class="round"
                      aria-label={`Take 1 cell out of ${info.name}`}
                      disabled={n === 0}
                      onClick={() => move(sys, 'tray')}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      class="round"
                      aria-label={`Give 1 cell to ${info.name}`}
                      disabled={free === 0}
                      onClick={() => move('tray', sys)}
                    >
                      +
                    </button>
                  </div>
                  <p class="bin-help small">{info.help}</p>
                </div>
              );
            })}
          </div>

          <div class="preview" aria-live="polite">
            <h3>What will happen</h3>
            <ul>
              {lines.map((l) => (
                <PreviewRow key={l.system} line={l} />
              ))}
            </ul>
          </div>

          <div class="confirm">
            <Button kind="primary" class={tut === 4 ? 'bin-hint' : ''} onClick={endSol}>
              🌙 End sol {game.sol}
            </Button>
            <Button kind="ghost" onClick={() => setAlloc(emptyAllocation())} disabled={used === 0}>
              ↺ Take all cells back
            </Button>
          </div>
        </section>
      </div>

      <p class="sr-only" role="status" aria-live="polite">{announce}</p>
      {drag && (
        <span class="token token-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">
          ⚡
        </span>
      )}
    </main>
  );
}

const PREVIEW_ICON: Record<PreviewLine['system'], string> = { life: '❤️', dose: '☢️', battery: '🔋', science: '🔬', comms: '📡' };
const ARROW = { up: '↑', down: '↓', same: '→' } as const;
const ARROW_WORD = { up: 'goes up', down: 'goes down', same: 'stays the same' } as const;
const TONE_MARK = { good: '✓', bad: '⚠', neutral: '' } as const;

function PreviewRow({ line }: { line: PreviewLine }) {
  return (
    <li class={`pv pv-${line.tone}`}>
      <span class="pv-icon" aria-hidden="true">{PREVIEW_ICON[line.system]}</span>
      <span class="pv-arrow" role="img" aria-label={ARROW_WORD[line.trend]}>{ARROW[line.trend]}</span>
      <span class="pv-text">{line.text}</span>
      <span class="pv-mark" aria-hidden="true">{TONE_MARK[line.tone]}</span>
    </li>
  );
}
