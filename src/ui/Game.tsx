import { useEffect, useRef, useState } from 'preact/hooks';
import { addDays } from '../data/donki-mapping';
import { CONFIG } from '../sim/config';
import { nightNote, STORM_HONESTY, stormName } from '../sim/debrief';
import {
  bonusSamples,
  emptyAllocation,
  goalSamples,
  samplesText,
  starsFor,
  SYSTEMS,
  totalCells,
  type Allocation,
  type GameState,
  type MorningView,
  type SolRecord,
  type Storm,
  type SystemId,
} from '../sim/state';
import { batteryAfterAllocation, doseFor, lifeDeltaFromCells, morning, newGame, preview, step, type PreviewLine } from '../sim/step';
import type { Mission } from './App';
import { Button, DataBadge, HudBar, SourceLink, Term, type Level } from './components';
import { FACTS, KID_DELAY_LINE, SYSTEM_INFO } from './copy';
import { Icon, Stars, type IconName } from './icons';
import { OutpostScene } from './scene/OutpostScene';
import { markTutorialDone } from './tutorial';

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
  const honesty = (
    <p class="event-source honesty-line">
      <Icon name="idea" /> {STORM_HONESTY}
    </p>
  );
  if (!storm.source)
    return (
      <>
        <p class="event-source">
          <Icon name="game" /> Game event. This storm was made up by the game, not taken from real data.
        </p>
        {honesty}
      </>
    );
  const s = storm.source;
  return (
    <>
      <p class="event-source">
        <Icon name="data" /> <strong>Real data:</strong> <Term id="flare">solar flare</Term> class <strong>{s.classType}</strong>, seen on{' '}
        {niceDate(s.time)} (NASA DONKI record {s.link ? <SourceLink href={s.link}>{s.id}</SourceLink> : s.id}).
        {storm.sep && ' A linked particle event was measured too.'}{' '}
        {mission.marsObserved
          ? 'NASA spacecraft at Mars also measured storms in this period. The game imagines how this one would feel at your outpost.'
          : 'This flare was seen from Earth. The game imagines it reaching Mars.'}
      </p>
      {honesty}
    </>
  );
}

const TUTORIAL = [
  'Welcome, Commander! Each yellow chip is one power cell. Tap + on a system to give it a cell. You can also drag cells.',
  `First, keep the crew alive. Give Life Support ${CONFIG.lifeNeed} cells.`,
  "Now give Comms 1 cell. Then Earth can send you tomorrow's space weather.",
  'Put the other cells where you like. Science collects samples. Shielding blocks storms. Cells you leave in the tray charge the battery. The chips at the bottom show what will happen.',
  'Ready? Press "End sol" to see what happens.',
];

/** The one line that matters most this morning. The full report is one tap away. */
function headline(view: MorningView, storm: Storm | null | undefined): { icon: IconName; tone: string; alert: boolean; text: string } {
  if (view.hasForecast && storm)
    return { icon: 'flare', tone: 'alarm', alert: true, text: `Warning from Earth: a ${stormName({ storm })} arrives today. Keep the crew inside.` };
  if (!view.hasForecast)
    return { icon: 'question', tone: 'solar', alert: true, text: 'No forecast today. Comms had no power, so a storm could be a surprise.' };
  if (view.dust) return { icon: 'dust', tone: 'butterscotch', alert: true, text: `Dust storm. The panels made only ${view.solar} cells. No solar storm today.` };
  if (view.dustTomorrow) return { icon: 'dust', tone: 'butterscotch', alert: true, text: 'Dust storm tomorrow. Save some cells in the battery. No solar storm today.' };
  return { icon: 'sun', tone: 'solar', alert: false, text: `Clear sky and no solar storm today. The panels made ${view.solar} cells.` };
}

const NIGHT_ICONS: [string, IconName, string][] = [
  ['shield held', 'shield', 'blue'],
  ['storm', 'flare', 'alarm'],
  ['cold', 'cold', 'blue'],
  ['Life Support', 'life', 'butterscotch'],
  ['wore out', 'wrench', 'butterscotch'],
  ['harvest', 'plant', 'butterscotch'],
  ['Dust', 'dust', 'butterscotch'],
  ['science', 'science', 'haze'],
  ['Saving', 'battery', 'solar'],
];

export function Game({ mission, onFinish, onQuit, onSources }: Props) {
  const [game, setGame] = useState<GameState>(() => newGame(mission.scenario, mission.seed));
  const [alloc, setAlloc] = useState<Allocation>(emptyAllocation);
  const [night, setNight] = useState<SolRecord | null>(null);
  const [tut, setTut] = useState<number | null>(mission.tutorial ? 0 : null);
  const [drag, setDrag] = useState<{ from: DropTarget; x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [more, setMore] = useState(false);
  const [chip, setChip] = useState<PreviewLine['system'] | null>(null);
  // Motion: a cell in flight between the tray and a socket, a pulse along a conduit, and the end-of-sol timelapse.
  const [flights, setFlights] = useState<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]);
  const [pulse, setPulse] = useState<{ system: SystemId; id: number; back: boolean } | null>(null);
  const [cine, setCine] = useState(false);
  const motionId = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

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

  // The full morning report closes on Escape or a tap outside it.
  useEffect(() => {
    if (!more) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !moreRef.current?.contains(e.target as Node)) setMore(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [more]);

  /** Screen position of the last cell (or the next free slot) of the tray or a socket. */
  const spot = (t: DropTarget, last: boolean) => {
    const box = document.querySelector(t === 'tray' ? '.tray .tokens' : `.socket[data-drop="${t}"] .socket-cells`);
    if (!box) return null;
    const cells = box.querySelectorAll('.token, .pip');
    const cell = cells[cells.length - 1];
    const r = (cell ?? box).getBoundingClientRect();
    const size = t === 'tray' ? 46 : 32;
    return cell ? { x: r.left + r.width / 2 + (last ? 0 : size), y: r.top + r.height / 2 } : { x: r.left + size / 2, y: r.top + r.height / 2 };
  };

  /** Responsive motion: the cell flies from where it was to where it goes. */
  const animateMove = (from: DropTarget, to: DropTarget) => {
    if (reducedMotion()) return;
    const a = spot(from, true);
    const b = spot(to, false);
    if (!a || !b) return;
    const id = ++motionId.current;
    setFlights((f) => [...f, { id, x: a.x, y: a.y, dx: b.x - a.x, dy: b.y - a.y }]);
    // Remove it when the flight is over, even if the browser paused the animation (hidden tab).
    setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 400);
  };

  const move = (from: DropTarget, to: DropTarget, fly = false) => {
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
    if (fly) animateMove(from, to);
    // The conduit of the system that gained or lost a cell carries one pulse.
    if (from === 'tray' || to === 'tray') setPulse({ system: to === 'tray' ? (from as SystemId) : to, id: ++motionId.current, back: to === 'tray' });
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
    if (tut !== null) markTutorialDone(); // finished
    setTut(null);
    setMore(false);
    setChip(null);
    setPulse(null);
    setCine(!reducedMotion()); // with reduced motion the night card simply fades in
  };

  // The timelapse ends by itself, or at once on Skip, Space or Enter.
  useEffect(() => {
    if (!cine) return;
    const timer = setTimeout(() => setCine(false), CINE_MS);
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setCine(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', key);
    };
  }, [cine]);

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

  // During the timelapse the HUD still shows the morning values; it updates when night falls.
  const hv =
    cine && night
      ? { life: night.lifeBefore, dose: night.doseAfter - night.doseAdded, battery: night.batteryBefore, science: night.scienceAfter - night.scienceGained }
      : { life: game.life, dose: game.dose, battery: game.battery, science: game.science };
  const lifeLevel: Level = hv.life > 60 ? 'ok' : hv.life > 30 ? 'warn' : 'danger';
  const doseLeft = CONFIG.doseLimit - hv.dose;
  const doseLevel: Level = doseLeft > 200 ? 'ok' : doseLeft > 90 ? 'warn' : 'danger';
  const batteryLevel: Level = hv.battery >= 2 ? 'ok' : hv.battery === 1 ? 'warn' : today.dust ? 'danger' : 'warn';
  const stars = starsFor(hv.science);

  const header = (
    <header class="sol-head">
      <h1 class="sol-title" tabIndex={-1} ref={headingRef}>
        <Icon name={night ? 'night' : 'sun'} class={night ? 'tone-blue' : 'tone-solar'} /> <Term id="sol">Sol</Term>{' '}
        {night ? night.sol : game.sol} <span class="sol-of">/ {CONFIG.sols}</span>
      </h1>
      <p class="sol-mission">
        {mission.title} · Seed <strong>{mission.seed}</strong>
      </p>
      <DataBadge status={mission.status} />
      <div class="head-links">
        <Button kind="ghost" icon="search" onClick={onSources}>Science</Button>
        <Button kind="ghost" icon="close" onClick={onQuit}>Quit</Button>
      </div>
    </header>
  );

  const hud = (
    <div class="hud-grid" aria-label="Crew status">
      <HudBar
        icon="life"
        tone="butterscotch"
        label="Life Support"
        value={hv.life}
        max={CONFIG.lifeMax}
        number={`${hv.life} / ${CONFIG.lifeMax}`}
        text={`Life Support ${hv.life} of ${CONFIG.lifeMax}. Air, water and food.`}
        level={lifeLevel}
      />
      <HudBar
        icon="radiation"
        tone={doseLevel === 'ok' ? 'blue' : 'alarm'}
        label={<Term id="dose">Dose</Term>}
        value={hv.dose}
        max={CONFIG.doseLimit}
        number={`${Math.round(hv.dose)} / ${CONFIG.doseLimit} mSv`}
        text={`Radiation dose ${Math.round(hv.dose)} of ${CONFIG.doseLimit} millisieverts. Stay under the limit.`}
        level={doseLevel}
        ticks={[0.25, 0.5, 0.75]}
      />
      <HudBar
        icon="battery"
        tone="solar"
        label="Battery"
        value={hv.battery}
        max={CONFIG.batteryMax}
        number={`${hv.battery} / ${CONFIG.batteryMax} cells`}
        text={`Battery ${hv.battery} of ${CONFIG.batteryMax} cells stored.`}
        level={batteryLevel}
        segments={CONFIG.batteryMax}
      />
      <HudBar
        icon="science"
        tone="haze"
        label="Samples"
        value={goalSamples(hv.science)}
        max={CONFIG.scienceGoal}
        number={`${goalSamples(hv.science)} / ${CONFIG.scienceGoal}`}
        text={`${samplesText(hv.science)} samples collected.`}
        level="ok"
      >
        {stars > 0 && (
          <div class="hud-bonus">
            <Stars count={stars} /> Goal reached. Bonus: {bonusSamples(hv.science)}
            {stars < 3 && `, next star at ${stars * CONFIG.starStep}`}
          </div>
        )}
      </HudBar>
    </div>
  );

  // ---------- Night screen ----------
  if (night) {
    const note = nightNote(night);
    const over = game.status !== 'playing';
    // Most of the dose came from working outside: say so in the title.
    const outside = night.storm !== null && night.doseEva > night.doseAdded - night.doseEva;
    const title = outside ? 'Caught outside in a storm' : note.title;
    const [, icon, tone] = NIGHT_ICONS.find(([word]) => title.includes(word)) ?? ['', 'night' as IconName, 'blue'];
    return (
      <main class="sol-page sol-night">
        {header}
        <section class="stage stage-night" aria-label="Outpost at night">
          <OutpostScene
            time={cine ? 'day' : 'night'}
            cinematic={cine}
            dust={night.dust}
            panelsLit={cine ? night.solar : 0}
            panelsTotal={CONFIG.solarClear}
            cells={cine ? night.alloc : { ...night.alloc, science: 0 }}
            shieldMax={CONFIG.shieldMaxCells}
            stormWarned={false}
            storm={
              cine && night.storm
                ? {
                    blocked: night.stormDose > 0 ? night.doseBlocked / night.stormDose : 0,
                    count: night.storm.severity === 'minor' ? 10 : night.storm.severity === 'moderate' ? 16 : 22,
                    outside: night.alloc.science > 0,
                    seed: mission.seed * 100 + night.sol,
                  }
                : null
            }
          />
          {hud}
          {cine && (
            <div class="cine-bar">
              <p role="status">Sol {night.sol} is ending…</p>
              <Button kind="primary" autoFocus icon="skip" onClick={() => setCine(false)}>
                Skip
              </Button>
            </div>
          )}
          {!cine && (
          <div class="night-card" aria-live="polite">
            <h2>
              <Icon name={icon} class={`tone-${tone}`} /> {title}
            </h2>
            <p class="night-text">{note.text}</p>
            {night.storm && <StormSource storm={night.storm} mission={mission} />}
            {note.scaleNote && (
              <p class="event-source">
                <Icon name="idea" /> Everyday radiation added {CONFIG.baseDose} mSv today. {note.scaleNote}
              </p>
            )}
            <ul class="changes">
              <li>
                <Icon name="life" class="tone-butterscotch" /> Life Support {night.lifeBefore} <Icon name="right" label="to" /> <strong>{night.lifeAfter}</strong>
              </li>
              <li>
                <Icon name="radiation" class="tone-alarm" /> Dose +{Math.round(night.doseAdded)} mSv <Icon name="right" label="to" />{' '}
                <strong>{Math.round(night.doseAfter)}</strong> of {CONFIG.doseLimit}
              </li>
              <li>
                <Icon name="battery" class="tone-solar" /> Battery {night.batteryBefore} <Icon name="right" label="to" /> <strong>{night.batteryAfter}</strong> cells
              </li>
              <li>
                <Icon name="science" class="tone-haze" /> Samples +{night.scienceGained} <Icon name="right" label="to" />{' '}
                <strong>{samplesText(night.scienceAfter)}</strong>
              </li>
            </ul>
            <Button kind="primary" autoFocus icon={over ? 'debrief' : 'play'} onClick={nextSol}>
              {over ? 'See mission debrief' : `Start sol ${game.sol}`}
            </Button>
          </div>
          )}
        </section>
      </main>
    );
  }

  // ---------- Morning + planning ----------
  const storm = view.hasForecast ? view.stormToday : undefined;
  const known = view.hasForecast ? (view.stormToday ?? null) : null;
  const head = headline(view, storm);
  const firstDustSol = view.dust && game.sol > 1 && !game.plan[game.sol - 2].dust;

  // Short chip labels. The full sentence from the simulation stays one tap away.
  const d = doseFor(alloc, known);
  const lifeDelta = lifeDeltaFromCells(alloc.life);
  const batteryAfter = batteryAfterAllocation(view.solar, view.battery, used).after;
  const gain = alloc.science * CONFIG.sciencePerCell;
  const chipLabel: Record<PreviewLine['system'], string> = {
    life:
      lifeDelta < 0
        ? `Life Support −${-lifeDelta}`
        : lifeDelta > 0 && view.life < CONFIG.lifeMax
          ? `Life Support +${Math.min(lifeDelta, CONFIG.lifeMax - view.life)}`
          : lifeDelta > 0
            ? 'Life Support is full'
            : 'Life Support steady',
    dose: `Dose +${Math.round(d.total)} mSv${view.hasForecast ? '' : ' or more'}`,
    battery: `Battery ${view.battery} to ${batteryAfter}`,
    science: gain > 0 ? `+${gain} ${gain === 1 ? 'sample' : 'samples'}` : 'No science today',
    comms: alloc.comms > 0 ? 'Forecast tomorrow' : 'No forecast tomorrow',
  };
  const shown = lines.find((l) => l.system === chip) ?? lines.find((l) => l.tone === 'bad' && l.system !== 'comms' && l.system !== 'science');

  return (
    <main class="sol-page">
      {header}

      <section class={`stage ${view.dust ? 'stage-dust' : 'stage-day'}`} aria-label="Outpost">
        <OutpostScene
          time="day"
          dust={view.dust}
          panelsLit={view.solar}
          panelsTotal={CONFIG.solarClear}
          cells={alloc}
          shieldMax={CONFIG.shieldMaxCells}
          stormWarned={Boolean(view.hasForecast && view.stormToday)}
          pulse={pulse}
        />
        {hud}
        {tut !== null && (
          <div class="coach" role="status">
            <p>
              <strong>Step {tut + 1} of {TUTORIAL.length}.</strong> {TUTORIAL[tut]}
            </p>
            <div class="coach-btns">
              {(tut === 0 || tut === 3) && (
                <Button kind="primary" icon="play" onClick={() => setTut(tut + 1)}>Got it</Button>
              )}
              <Button
                kind="ghost"
                onClick={() => {
                  markTutorialDone();
                  setTut(null);
                }}
              >
                Skip the tutorial
              </Button>
            </div>
          </div>
        )}
      </section>

      <section class={`today${head.alert ? ' today-alert' : ''}`} aria-label="Morning report" ref={moreRef}>
        <Icon name={head.icon} class={`tone-${head.tone}`} />
        <p class="today-text">
          <strong>{head.text}</strong>
          {game.sol === 1 && mission.notice && (
            <span class="today-notice">
              <Icon name={mission.status?.kind === 'live' ? 'live' : 'archived'} />{' '}
              {mission.status?.kind === 'live' ? 'Live data: ' : 'Saved data: '}
              {mission.notice}
            </span>
          )}
        </p>
        <button type="button" class="more-btn" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Less' : 'More'} <Icon name={more ? 'less' : 'more'} />
        </button>
        {more && (
          <div class="report" role="region" aria-label="Full morning report">
            <ul class="report-list">
              <li>
                {view.dust ? (
                  <>
                    <Icon name="dust" class="tone-butterscotch" /> <strong>Dust storm.</strong> The panels made only {view.solar} power cells today.
                  </>
                ) : (
                  <>
                    <Icon name="sun" class="tone-solar" /> Clear sky. The solar panels made <strong>{view.solar}</strong> power cells.
                  </>
                )}
              </li>
              <li>
                <Icon name="battery" class="tone-solar" /> The battery holds <strong>{view.battery}</strong> {view.battery === 1 ? 'cell' : 'cells'}. You can
                spend {view.available} today.
              </li>
              {view.hasForecast && storm && (
                <li class="warn-line">
                  <Icon name="warning" class="tone-alarm" /> <strong>Warning from Earth:</strong> a {stormName({ storm })} arrives <strong>today</strong>.
                  Power the <Term id="shielding">shielding</Term> and keep the crew inside.
                  <StormSource storm={storm} mission={mission} />
                </li>
              )}
              {view.hasForecast && !storm && (
                <li>
                  <Icon name="ok" class="tone-blue" /> Forecast from Earth: no solar storm today.
                </li>
              )}
              {view.hasForecast && view.dustTomorrow && !view.dust && (
                <li class="warn-line">
                  <Icon name="dust" class="tone-butterscotch" /> <strong>Dust storm tomorrow.</strong> Save some cells in the battery.{' '}
                  <span class="small">(Game rule: in this game, the forecast from Earth also warns about dust one sol ahead.)</span>
                </li>
              )}
              {view.hasForecast && view.dust && (
                <li>
                  <Icon name="dust" class="tone-butterscotch" />{' '}
                  {view.dustTomorrow ? 'More dust tomorrow. Keep the battery charged for the heaters.' : 'The dust should clear tomorrow.'}
                </li>
              )}
              {!view.hasForecast && (
                <li class="warn-line">
                  <Icon name="question" class="tone-solar" /> <strong>No forecast today.</strong> Comms had no power yesterday, so no message came from Earth.
                  A storm could be a surprise.
                </li>
              )}
              {firstDustSol && (
                <li class="fact-line">
                  <Icon name="story" /> True story: in 2018 a dust storm covered Mars. The Opportunity rover ran on solar power. It sent its last message on{' '}
                  {FACTS.opportunity_last_contact.value}.
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
              {game.sol <= 2 && (
                <li class="fact-line">
                  <Icon name="comms" class="tone-blue" /> <Term id="commdelay">Comm delay</Term>: {KID_DELAY_LINE} In this game, an answer from Earth
                  arrives the next sol.
                </li>
              )}
              {dataDate && <li class="small">Sun data for this sol: {niceDate(dataDate)}.</li>}
            </ul>
          </div>
        )}
      </section>

      <section class={`tray${drag ? ' drop-ready' : ''}`} data-drop="tray" aria-label="Power cells to share out">
        <div class="tray-head">
          <strong>
            {free} {free === 1 ? 'cell' : 'cells'} left
          </strong>
          <span class="small">Cells left here charge the battery. Every 3rd saved cell is lost as heat.</span>
        </div>
        <div class="tokens">
          {Array.from({ length: freeSolar }, (_, i) => (
            <span key={`s${i}`} class="token token-sun" onPointerDown={startDrag('tray')} title="Power cell from the Sun">
              <Icon name="cell" />
            </span>
          ))}
          {Array.from({ length: freeBattery }, (_, i) => (
            <span key={`b${i}`} class="token token-batt" onPointerDown={startDrag('tray')} title="Power cell from the battery">
              <Icon name="battery" />
            </span>
          ))}
          {free === 0 && <span class="small">All cells are in use.</span>}
        </div>
        <Button kind="ghost" icon="retry" class="tray-reset" onClick={() => setAlloc(emptyAllocation())} disabled={used === 0}>
          Take all back
        </Button>
      </section>

      <div class="sockets">
        {SYSTEMS.map((sys) => {
          const info = SYSTEM_INFO[sys];
          const n = alloc[sys];
          const hint = (tut === 1 && sys === 'life') || (tut === 2 && sys === 'comms');
          return (
            <div
              key={sys}
              class={`socket tone-${info.tone}${drag ? ' drop-ready' : ''}${hint ? ' bin-hint' : ''}`}
              data-drop={sys}
              role="group"
              aria-label={`${info.name}: ${n} ${n === 1 ? 'cell' : 'cells'}. ${info.help}`}
            >
              <div class="socket-head">
                <Icon name={info.icon} />
                <span class="socket-name">{info.name}</span>
                <span class="socket-count" aria-hidden="true">{n}</span>
              </div>
              <div class="socket-cells">
                {Array.from({ length: n }, (_, i) => (
                  <span key={i} class="pip" onPointerDown={startDrag(sys)}>
                    <Icon name="cell" />
                  </span>
                ))}
              </div>
              <p class="socket-hint" title={info.help}>
                {info.hint}
                {sys === 'comms' && (
                  <>
                    {' '}
                    <Term id="commdelay">Why?</Term>
                  </>
                )}
              </p>
              <div class="socket-btns">
                <button type="button" class="round" aria-label={`Take 1 cell out of ${info.name}`} disabled={n === 0} onClick={() => move(sys, 'tray', true)}>
                  <Icon name="minus" />
                </button>
                <button type="button" class="round" aria-label={`Give 1 cell to ${info.name}`} disabled={free === 0} onClick={() => move('tray', sys, true)}>
                  <Icon name="plus" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section class="outcome-row" aria-label="What will happen">
        <div class="chips-wrap" aria-live="polite">
          <ul class="chips">
            {lines.map((l) => (
              <li key={l.system}>
                <button
                  type="button"
                  class={`chip chip-${l.tone}`}
                  aria-pressed={shown?.system === l.system}
                  aria-description={l.text}
                  title={l.text}
                  onClick={() => setChip(chip === l.system ? null : l.system)}
                >
                  <Icon name={CHIP_ICON[l.system]} />
                  <span>{chipLabel[l.system]}</span>
                  <Icon
                    name={l.tone === 'bad' ? 'warning' : l.trend === 'up' ? 'up' : l.trend === 'down' ? 'down' : 'right'}
                    label={l.tone === 'bad' ? 'Warning' : ARROW_WORD[l.trend]}
                  />
                </button>
              </li>
            ))}
          </ul>
          <p class={`chip-detail${shown?.tone === 'bad' ? ' chip-detail-bad' : ''}`}>
            {shown ? (
              <>
                {shown.tone === 'bad' && <Icon name="warning" />} {shown.text}
              </>
            ) : (
              <span class="small">Tap a chip to read more.</span>
            )}
          </p>
        </div>
        <Button kind="primary" icon="night" class={`end-sol${tut === 4 ? ' bin-hint' : ''}`} onClick={endSol}>
          End sol {game.sol}
        </Button>
      </section>

      <p class="sr-only" role="status" aria-live="polite">{announce}</p>
      {flights.map((f) => (
        <span
          key={f.id}
          class="token flight"
          style={{ left: `${f.x}px`, top: `${f.y}px`, '--dx': `${f.dx}px`, '--dy': `${f.dy}px` }}
          aria-hidden="true"
          onAnimationEnd={() => setFlights((list) => list.filter((x) => x.id !== f.id))}
        >
          <Icon name="cell" />
        </span>
      ))}
      {drag && (
        <span class="token token-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">
          <Icon name="cell" />
        </span>
      )}
    </main>
  );
}

/** Length of the end-of-sol timelapse. Keep in step with the scene-cine keyframes in styles.css. */
const CINE_MS = 2800;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const CHIP_ICON: Record<PreviewLine['system'], IconName> = { life: 'life', dose: 'radiation', battery: 'battery', science: 'science', comms: 'comms' };
const ARROW_WORD = { up: 'goes up', down: 'goes down', same: 'stays the same' } as const;
