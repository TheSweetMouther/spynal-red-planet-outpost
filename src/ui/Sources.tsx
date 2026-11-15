import { useEffect, useState } from 'preact/hooks';
import { badgeText, DONKI_NEW, DONKI_OLD, loadIndex, type SnapshotIndexEntry } from '../data/loader';
import { NOTIFICATION_THRESHOLD } from '../data/donki-notifications';
import { CONFIG } from '../sim/config';
import { SCALE_NOTE, STORM_HONESTY } from '../sim/debrief';
import type { Mission } from './App';
import { Button, DataBadge, SourceLink, Term } from './components';
import { Icon } from './icons';
import { CARD_SOURCES, FACTS, FACTS_CHECKED } from './copy';
import credits from '../data/image-credits.json';

type Fact = { label: string; value: string | number; unit: string; source_title: string; source_url: string; uncertainty?: number; note?: string; confirm_title?: string; confirm_url?: string };

function FactCell({ f }: { f: Fact }) {
  return (
    <>
      <strong>
        {f.value}
        {f.uncertainty ? ` ± ${f.uncertainty}` : ''} {f.unit === 'date' || f.unit === 'time' ? '' : f.unit}
      </strong>
      <br />
      <span class="small">
        <SourceLink href={f.source_url}>{f.source_title}</SourceLink>
        {f.confirm_url && (
          <>
            {' '}· read in: <SourceLink href={f.confirm_url}>{f.confirm_title}</SourceLink>
          </>
        )}
      </span>
    </>
  );
}

/** The "Complete?" cell: what was downloaded from the API and what is still missing. */
function Completeness({ s }: { s: SnapshotIndexEntry }) {
  if (!s.partial && s.flare_source === 'FLR') return <><Icon name="ok" class="tone-blue" /> Complete: flares and particle events downloaded from the DONKI API.</>;
  if (s.flare_source === 'notifications')
    return (
      <>
        <Icon name="ok" class="tone-blue" /> <strong>Particle events:</strong> complete download from the DONKI API.
        <br />
        <Icon name="warning" class="tone-alarm" /> <strong>Flares: partial.</strong> DONKI's flare list (FLR) answered “{s.flr_problem ?? 'error'}” on the download day, so
        flares come from DONKI's own flare notifications, which cover every flare of class {NOTIFICATION_THRESHOLD} and bigger
        {s.flares_from_archive ? `, plus ${s.flares_from_archive} records read from Internet Archive copies of DONKI pages` : ''}.
        Flares smaller than {NOTIFICATION_THRESHOLD} may be missing.
      </>
    );
  return <><Icon name="warning" class="tone-alarm" /> Partial: built from Internet Archive copies of DONKI pages because the DONKI API could not be reached. Some real flares are missing.</>;
}

export function Sources({ mission, onBack }: { mission: Mission | null; onBack: () => void }) {
  const F = FACTS as unknown as Record<string, Fact>;
  const [snapshots, setSnapshots] = useState<SnapshotIndexEntry[] | null>(null);
  useEffect(() => {
    loadIndex((url) => fetch(url))
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, []);
  const perSol = FACTS.mars_surface_dose_eq.value * 1.0275;

  const scaled: { what: string; fact: Fact; game: string; why: string }[] = [
    {
      what: 'Everyday radiation on Mars',
      fact: F.mars_surface_dose_eq,
      game: `${CONFIG.baseDose} mSv per game sol`,
      why: `One game sol stands for ${CONFIG.solScale} real sols, so 10 turns feel like a ${CONFIG.sols * CONFIG.solScale}-sol stay. ${FACTS.mars_surface_dose_eq.value} mSv/day × 1.0275 days per sol × ${CONFIG.solScale} = ${(perSol * CONFIG.solScale).toFixed(1)}, rounded to ${CONFIG.baseDose}.`,
    },
    {
      what: 'Radiation limit',
      fact: F.career_limit,
      game: `${CONFIG.doseLimit} mSv for the mission`,
      why: 'Same number. In real life this is the limit for an astronaut\'s whole career, not for one mission.',
    },
    {
      what: 'Solar storm dose',
      fact: F.may2024_mars_dose,
      game: `${CONFIG.stormDose.minor} / ${CONFIG.stormDose.moderate} / ${CONFIG.stormDose.severe} mSv for a small / medium / big storm, × ${CONFIG.sepMultiplier} with a particle blast`,
      why: `Made much bigger for play. The biggest storm Curiosity has measured on the ground gave about 8 mGy, far less than the game's big storms. ${STORM_HONESTY} Every storm card in the game says this too.`,
    },
    {
      what: 'Length of a day',
      fact: F.sol_length,
      game: '1 turn = 1 sol',
      why: 'The game has no clock. A turn lasts as long as you need.',
    },
    {
      what: 'Talking to Earth',
      fact: { ...F.light_delay_max, value: `${FACTS.light_delay_min.value}–${FACTS.light_delay_max.value}`, label: 'One-way radio delay' },
      game: 'Answers arrive the next sol',
      why: 'The real delay is minutes, not a whole sol. The game stretches it so you can feel what “too late to help right now” means in a turn-based game.',
    },
    {
      what: 'Dust storms and solar power',
      fact: F.dust_2018_tau,
      game: `Solar power drops from ${CONFIG.solarClear} to ${CONFIG.solarDust} cells for ${CONFIG.dustLength} sols`,
      why: 'The real 2018 storm was far worse and lasted for months. It ended the solar-powered Opportunity rover\'s mission. The game keeps dust storms short so the mission can continue.',
    },
    {
      what: 'Shielding',
      fact: { label: 'no single real value', value: 'varies', unit: '', source_title: 'NASA: Mars solar storm article (cliffs and lava tubes could add shielding)', source_url: FACTS.may2024_mars_dose.source_url },
      game: `Each cell blocks ${CONFIG.shieldPerCell * 100}% of a storm's dose for the crew inside, up to ${CONFIG.shieldMaxCells} cells (${CONFIG.shieldPerCell * CONFIG.shieldMaxCells * 100}%). It does not block the everyday ${CONFIG.baseDose} mSv`,
      why: 'A simple game rule. Real shielding depends on the material and how thick it is. The game treats the shelter as a storm shelter only: everyday cosmic rays are much harder to stop than storm particles, so in the game they always get through.',
    },
    {
      what: 'Working outside (Science)',
      fact: { label: 'no single real value', value: 'varies', unit: '', source_title: 'NASA: Mars solar storm article (astronauts would need to shelter)', source_url: FACTS.may2024_mars_dose.source_url },
      game: `Each Science cell adds ${CONFIG.evaDose} mSv, plus ${CONFIG.evaStormShare * 100}% of that sol's storm dose (at most ${CONFIG.evaStormMax * 100}% in one sol). Shielding cannot reduce it`,
      why: 'A game rule that teaches the real operating rule: on a storm day, cancel the work outside and stay in the shelter. People outside have no shelter around them.',
    },
    {
      what: 'Dust storm warning',
      fact: { label: 'no real forecast product is claimed', value: 'game rule', unit: '', source_title: 'NASA / JPL: Opportunity and the 2018 dust storm', source_url: FACTS.dust_2018_tau.source_url },
      game: 'A forecast from Earth (1 Comms cell the sol before) also warns about dust one sol ahead',
      why: 'A game rule, so that saving battery is a choice and not luck. The game does not copy any real dust forecast service.',
    },
    {
      what: 'Science goal and stars',
      fact: { label: 'not a real value', value: 'game rule', unit: '', source_title: 'Game rule. The dose limit it is balanced against is real: NASA-STD-3001', source_url: FACTS.career_limit.source_url },
      game: `${CONFIG.scienceGoal} samples to finish the mission. ${CONFIG.starStep} bonus samples earn a second star, ${CONFIG.starStep * 2} a third`,
      why: 'Made up for play. The goal was tuned with 1,000 robot missions per strategy so that a fixed plan fails and a player who reacts to warnings usually wins.',
    },
  ];

  const unverified = Object.entries({ ...FACTS, ...CARD_SOURCES }).filter(([, f]) => !(f as { verified: boolean }).verified);

  return (
    <main class="page text-page">
      <Button kind="ghost" icon="back" onClick={onBack}>Back</Button>
      <h1><Icon name="search" class="tone-blue" /> The Science Behind This</h1>
      <p class="lead">
        This game mixes <strong>real NASA data</strong> with <strong>simple game rules</strong>. This page shows which is
        which, so you always know what is real.
      </p>

      <section class="panel">
        <h2>For kids: what is real?</h2>
        <ul>
          <li><Icon name="ok" class="tone-blue" /> <strong>Real:</strong> the <Term id="flare">solar flares</Term> in replay missions. Each one has a NASA record number.</li>
          <li><Icon name="ok" class="tone-blue" /> <strong>Real:</strong> the facts about Mars, radiation, dust storms and <Term id="commdelay">comm delay</Term>.</li>
          <li><Icon name="game" /> <strong>Game rules:</strong> power cells, the size of storm doses, how well the shield works, and the dust storm warning. Real life is more complicated!</li>
          <li><Icon name="data" /> <strong>Bigger numbers:</strong> {SCALE_NOTE} Real life: about {FACTS.mars_surface_dose_eq.value} mSv per day on Mars. In the game: {CONFIG.baseDose} mSv per sol.</li>
          <li><Icon name="game" /> <strong>Game events:</strong> dust storm timing, worn-out parts and harvests. The game always labels these.</li>
          <li><Icon name="idea" /> <strong>Imagined:</strong> most flares were seen from Earth's side of the Sun. The game <em>imagines</em> each one reaching Mars.</li>
        </ul>
      </section>

      <section class="panel">
        <h2>Data status right now</h2>
        {mission ? (
          <p>
            Current mission: <strong>{mission.title}</strong> <DataBadge status={mission.status} />
            {mission.status && (
              <>
                <br />
                <span class="small">
                  {badgeText(mission.status)}. Downloaded {mission.status.fetchedAt.slice(0, 10)} from: {mission.status.source}.
                  {mission.status.origin === 'cache' && ' This is the last live download, kept in this browser.'}
                  {mission.status.flareSource === 'notifications' && ` Flares come from DONKI flare notifications (class ${NOTIFICATION_THRESHOLD} and bigger), because DONKI's flare list did not answer. Smaller flares may be missing.`}
                  {mission.status.partial && mission.status.flareSource !== 'notifications' && ' This saved copy is partial: it only has the flares the archive captured.'}
                  {mission.status.reason && mission.status.kind === 'archived' && ` Live data was not used because: ${mission.status.reason}.`}
                  {mission.status.reason && mission.status.kind === 'live' && ` Problem seen: ${mission.status.reason}.`}
                </span>
              </>
            )}
          </p>
        ) : (
          <p>No mission started yet. Start one to see its data badge here.</p>
        )}
        <h3>Saved snapshots in this build</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">Mission</th><th scope="col">Days covered</th><th scope="col">Downloaded from (source_endpoint)</th><th scope="col">Downloaded at (fetched_at)</th><th scope="col">Records</th><th scope="col">Complete?</th></tr>
            </thead>
            <tbody>
              {(snapshots ?? []).map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.title}</th>
                  <td>{s.start} to {s.end}</td>
                  <td><code>{s.source_endpoint ?? s.source ?? 'unknown'}</code></td>
                  <td>{s.fetched_at}</td>
                  <td>{s.flares ?? '?'} flares, {s.particleEvents ?? '?'} particle events</td>
                  <td><Completeness s={s} /></td>
                </tr>
              ))}
              {snapshots !== null && snapshots.length === 0 && (
                <tr><td colSpan={6}>The snapshot list could not be loaded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <ul>
          <li><strong><Icon name="live" /> LIVE</strong> means the game downloaded Sun data from NASA a moment ago.</li>
          <li><strong><Icon name="archived" /> ARCHIVED DATA</strong> means a saved copy. Replay missions always use saved copies, so they work offline. If Today's Sun cannot reach NASA, it uses the last live download kept in this browser, or the newest snapshot, and says so in the first morning report.</li>
          <li><strong><Icon name="game" /> GAME EVENTS</strong> means made-up storms (Random mission).</li>
        </ul>
      </section>

      <section class="panel">
        <h2>How a real flare becomes a game storm</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">NASA DONKI record</th><th scope="col">In the game</th><th scope="col">Dose with no shield</th></tr>
            </thead>
            <tbody>
              <tr><td>Flare class <strong>C</strong></td><td>Small storm</td><td>{CONFIG.stormDose.minor} mSv</td></tr>
              <tr><td>Flare class <strong>M</strong></td><td>Medium storm</td><td>{CONFIG.stormDose.moderate} mSv</td></tr>
              <tr><td>Flare class <strong>X</strong></td><td>Big storm</td><td>{CONFIG.stormDose.severe} mSv</td></tr>
              <tr><td>Linked, measured <strong>SEP</strong> event (solar energetic particles)</td><td>“Particle blast”: radiation spike</td><td>× {CONFIG.sepMultiplier}</td></tr>
              <tr><td>Flare class A or B</td><td>Too small. Ignored</td><td>—</td></tr>
            </tbody>
          </table>
        </div>
        <ul>
          <li>One Earth day of data becomes one game sol. If a day has several flares, the strongest one counts.</li>
          <li>A particle event counts only if DONKI links it to that day's flare (directly or through the same eruption) and an instrument measured it. Model forecasts are ignored.</li>
          <li>Sol 1 is always calm so new players can learn.</li>
          <li>The seed slides the start day of a replay by up to 2 days, and places dust storms and small game events.</li>
        </ul>
        <p class="honesty">
          <strong>Honesty note:</strong> DONKI flares are observed from near Earth. A flare aimed at Earth may miss Mars
          completely. The game imagines the event reaching Mars. The replay windows were chosen because NASA spacecraft at
          Mars really did measure storms then: in September 2017, Curiosity's surface radiation reading was{' '}
          {FACTS.sep2017_mars.value} any earlier one (<SourceLink href={FACTS.sep2017_mars.source_url}>source</SourceLink>),
          and in May 2024 Curiosity measured about {FACTS.may2024_mars_dose.value.toLocaleString()} micrograys from one
          storm, like {FACTS.may2024_xrays.value} chest X-rays (<SourceLink href={FACTS.may2024_mars_dose.source_url}>source</SourceLink>).
        </p>
      </section>

      <section class="panel">
        <h2>Real value vs. game value</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">What</th><th scope="col">Real value and source</th><th scope="col">In the game</th><th scope="col">Why they differ</th></tr>
            </thead>
            <tbody>
              {scaled.map((s) => (
                <tr key={s.what}>
                  <th scope="row">{s.what}</th>
                  <td><FactCell f={s.fact} /></td>
                  <td>{s.game}</td>
                  <td>{s.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Every dataset used</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">Dataset</th><th scope="col">What it drives</th><th scope="col">Live or archived</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><SourceLink href="https://ccmc.gsfc.nasa.gov/tools/DONKI/">NASA CCMC DONKI</SourceLink> (flares FLR, particle events SEP)</td>
                <td>Solar storms in Real Storm Replay and Today's Sun</td>
                <td>Replay: archived snapshots in <code>public/data/donki/</code>. Today's Sun: live from <code>{DONKI_NEW}</code>, then <code>{DONKI_OLD}</code>, then the last live download kept in this browser, then the newest snapshot. Each endpoint gets 4 seconds.</td>
              </tr>
              <tr>
                <td>Curiosity RAD (<SourceLink href={FACTS.mars_surface_dose_eq.source_url}>Hassler et al. 2014</SourceLink>; <SourceLink href={FACTS.cruise_dose_eq.source_url}>Zeitlin et al. 2013</SourceLink>)</td>
                <td>Everyday radiation dose; cruise comparison</td>
                <td>Fixed facts, checked {FACTS_CHECKED}</td>
              </tr>
              <tr>
                <td><SourceLink href={FACTS.iss_absorbed.source_url}>NASA OSDR RadLab</SourceLink></td>
                <td>“Mars vs. the Space Station” card</td>
                <td>Fixed fact, computed from RadLab data on {FACTS_CHECKED}</td>
              </tr>
              <tr>
                <td>NASA OSDR studies {Object.values(CARD_SOURCES).filter((c) => c.study_id.startsWith('OSD')).map((c, i) => (
                  <span key={c.study_id}>{i > 0 && ', '}<SourceLink href={c.source_url}>{c.study_id}</SourceLink></span>
                ))}</td>
                <td>Real NASA Science cards (bones, muscles, body clock, radiation)</td>
                <td>Fixed, curated</td>
              </tr>
              <tr>
                <td><SourceLink href={CARD_SOURCES.food.source_url}>Canadian Space Agency food production toolkit</SourceLink></td>
                <td>Greenhouse card</td>
                <td>Fixed, curated</td>
              </tr>
              <tr>
                <td><SourceLink href={FACTS.career_limit.source_url}>NASA-STD-3001 radiation limit</SourceLink></td>
                <td>The {CONFIG.doseLimit} mSv mission limit</td>
                <td>Fixed fact</td>
              </tr>
              <tr>
                <td>NASA / JPL news on <SourceLink href={FACTS.opportunity_end.source_url}>Opportunity</SourceLink> and the <SourceLink href={FACTS.dust_2018_tau.source_url}>2018 dust storm</SourceLink></td>
                <td>Dust storm event and its true story</td>
                <td>Fixed facts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>All facts and where they come from</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">Fact</th><th scope="col">Value and source</th><th scope="col">Checked?</th></tr>
            </thead>
            <tbody>
              {Object.entries(F).map(([key, f]) => (
                <tr key={key}>
                  <th scope="row">{f.label}{f.note && <><br /><span class="small">{f.note}</span></>}</th>
                  <td><FactCell f={f} /></td>
                  <td>{(f as unknown as { verified: boolean }).verified ? 'Verified' : 'Not verified'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Unverified values:</strong>{' '}
          {unverified.length === 0 ? 'none. Every value above was read in its source.' : unverified.map(([k]) => k).join(', ')}
        </p>
      </section>

      <section class="panel">
        <h2>Pictures</h2>
        <ul>
          {credits.map((c) => (
            <li key={c.file}>
              {c.title}. Credit: {c.credit}. <SourceLink href={c.source_url}>Source</SourceLink>
            </li>
          ))}
        </ul>
        <p class="small">The Mars Rover Photos API is not used (it is archived). Pictures are stored with the game.</p>
      </section>
    </main>
  );
}
