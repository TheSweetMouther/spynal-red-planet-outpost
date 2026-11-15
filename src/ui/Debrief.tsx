import { useState } from 'preact/hooks';
import { CONFIG } from '../sim/config';
import { keyDecisions, outcomeText, stormName, unlockedCards } from '../sim/debrief';
import { samplesText, type GameState, type SolRecord } from '../sim/state';
import type { Mission } from './App';
import { Button, DataBadge, SourceLink } from './components';
import { CARD_SOURCES, CARD_TEXT } from './copy';
import { Icon, Stars, type IconName } from './icons';

interface Props {
  mission: Mission;
  state: GameState;
  onRetry: () => void;
  onNew: () => void;
  onSources: () => void;
}

/** What happened on a sol, as icon + words (never an icon alone). */
function solEvents(r: SolRecord): { icon: IconName; tone: string; text: string }[] {
  const out: { icon: IconName; tone: string; text: string }[] = [];
  if (r.storm)
    out.push({
      icon: 'flare',
      tone: 'alarm',
      text: `${stormName(r)}${r.storm.source ? ` (flare ${r.storm.source.classType})` : ''}${r.forecast ? '' : ', no warning'}`,
    });
  if (r.dust) out.push({ icon: 'dust', tone: 'butterscotch', text: `dust${r.coldNight ? ', cold night' : ''}` });
  if (r.small === 'wear') out.push({ icon: 'wrench', tone: 'butterscotch', text: 'part wore out' });
  if (r.small === 'harvest') out.push({ icon: 'plant', tone: 'butterscotch', text: 'harvest' });
  if (out.length === 0) out.push({ icon: 'sun', tone: 'solar', text: 'calm' });
  return out;
}

export function Debrief({ mission, state, onRetry, onNew, onSources }: Props) {
  const [details, setDetails] = useState(false);
  const outcome = outcomeText(state);
  const decisions = keyDecisions(state);
  const cards = unlockedCards(state);
  const won = state.status === 'won';
  const maxDose = Math.max(...state.history.map((r) => r.doseAdded), CONFIG.baseDose * 2);

  return (
    <main class="page debrief-page">
      <header class={`outcome ${won ? 'outcome-won' : 'outcome-lost'}`}>
        <p class="outcome-meta">
          Mission debrief · {mission.title} · Seed {mission.seed} <DataBadge status={mission.status} />
        </p>
        <h1>
          <Icon name={won ? 'trophy' : 'landed'} class={won ? 'tone-solar' : 'tone-butterscotch'} /> {outcome.title}
        </h1>
        {won && <Stars count={outcome.stars} />}
        <p class="lead">{outcome.text}</p>
        <ul class="final-stats" aria-label="Final numbers">
          <li>
            <Icon name="life" class="tone-butterscotch" /> Life Support <strong>{state.life}</strong>
          </li>
          <li>
            <Icon name="radiation" class="tone-alarm" /> Dose <strong>{Math.round(state.dose)}</strong> of {CONFIG.doseLimit} mSv
          </li>
          <li>
            <Icon name="battery" class="tone-solar" /> Battery <strong>{state.battery}</strong>
          </li>
          <li>
            <Icon name="science" class="tone-haze" /> Samples <strong>{samplesText(state.science)}</strong>
          </li>
        </ul>
        <div class="debrief-btns">
          <Button kind="primary" autoFocus icon="retry" onClick={onRetry}>Try again (same seed)</Button>
          <Button kind="primary" icon="rocket" onClick={onNew}>New mission</Button>
          <Button kind="ghost" icon="search" onClick={onSources}>The Science Behind This</Button>
        </div>
      </header>

      <section class="panel">
        <h2>The choices that mattered most</h2>
        {decisions.length === 0 && <p>You kept things steady the whole way. No single choice stood out.</p>}
        <ol class="decisions">
          {decisions.map((d) => (
            <li key={d.title} class={`decision decision-${d.tone}${d.cause ? ' decision-cause' : ''}`}>
              <Icon name={d.cause ? 'bad' : d.tone === 'good' ? 'good' : 'warning'} class={d.tone === 'good' ? 'tone-blue' : 'tone-alarm'} />
              <div>
                {d.cause && <p class="cause-tag">Why the mission ended this way</p>}
                <h3>{d.title}</h3>
                <p>{d.why}</p>
              </div>
            </li>
          ))}
        </ol>
        <p class="lesson">
          <Icon name="idea" /> <strong>The big idea:</strong> on Mars there is never enough power for everything. Protecting the crew from a solar storm
          means staying inside and doing less science that sol.
        </p>
      </section>

      <section class="panel">
        <h2>Mission timeline</h2>
        <ol class="sol-strip">
          {state.history.map((r) => {
            const events = solEvents(r);
            return (
              <li key={r.sol} class={`sol-tile${r.storm ? ' sol-tile-storm' : ''}`}>
                <span class="sol-tile-num">Sol {r.sol}</span>
                <span class="sol-tile-icons">
                  {events.map((e) => (
                    <Icon key={e.icon} name={e.icon} class={`tone-${e.tone}`} label={e.text} />
                  ))}
                </span>
                <span class="mini-dose" role="img" aria-label={`Dose plus ${Math.round(r.doseAdded)} millisieverts`}>
                  <span style={{ height: `${Math.max(6, (r.doseAdded / maxDose) * 100)}%` }} class={r.doseAdded > CONFIG.baseDose * 2 ? 'mini-high' : ''} />
                </span>
                <span class="sol-tile-val">+{Math.round(r.doseAdded)} mSv</span>
                <span class="sol-tile-val">
                  <Icon name="science" /> +{r.scienceGained}
                </span>
              </li>
            );
          })}
        </ol>
        <p class="small">Each tile: what happened, the dose added that sol (bar and number), and samples collected.</p>
        <button type="button" class="more-btn" aria-expanded={details} onClick={() => setDetails(!details)}>
          {details ? 'Hide details' : 'Show details'} <Icon name={details ? 'less' : 'more'} />
        </button>
        {details && (
          <>
            <div class="table-wrap">
              <table class="timeline">
                <thead>
                  <tr>
                    <th scope="col">Sol</th>
                    <th scope="col">Power</th>
                    <th scope="col">Life</th>
                    <th scope="col">Shield</th>
                    <th scope="col">Comms</th>
                    <th scope="col">Science</th>
                    <th scope="col">What happened</th>
                    <th scope="col">Dose</th>
                    <th scope="col">Life Support</th>
                  </tr>
                </thead>
                <tbody>
                  {state.history.map((r) => (
                    <tr key={r.sol}>
                      <th scope="row">{r.sol}</th>
                      <td>{r.solar} + {r.batteryBefore}</td>
                      <td>{r.alloc.life}</td>
                      <td>{r.alloc.shield}</td>
                      <td>{r.alloc.comms}</td>
                      <td>{r.alloc.science}</td>
                      <td class="ev">
                        {solEvents(r)
                          .map((e) => e.text)
                          .join('; ')}
                      </td>
                      <td>+{Math.round(r.doseAdded)}</td>
                      <td>{r.lifeAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="small">Power = cells from the Sun + cells in the battery that morning. The other numbers are the cells you gave each system.</p>
          </>
        )}
      </section>

      <section class="panel">
        <h2>Real NASA Science cards you unlocked</h2>
        {cards.length === 0 && <p>Play a few more sols to unlock science cards.</p>}
        <div class="cards">
          {cards.map((c) => {
            const t = CARD_TEXT[c.id];
            const src = CARD_SOURCES[c.id];
            return (
              <article class="sci-card" key={c.id}>
                <h3>
                  <Icon name={t.icon} class="tone-blue" /> {t.title}
                </h3>
                <p class="because small">Unlocked because: {c.because}</p>
                <p>{t.body}</p>
                <p class="small">
                  Source: <SourceLink href={src.source_url}>{src.source_title}</SourceLink>
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
