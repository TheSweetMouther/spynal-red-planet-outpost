import { CONFIG } from '../sim/config';
import { keyDecisions, outcomeText, stormName, unlockedCards } from '../sim/debrief';
import type { GameState } from '../sim/state';
import type { Mission } from './App';
import { Button, DataBadge, SourceLink } from './components';
import { CARD_SOURCES, CARD_TEXT } from './copy';

interface Props {
  mission: Mission;
  state: GameState;
  onRetry: () => void;
  onNew: () => void;
  onSources: () => void;
}

export function Debrief({ mission, state, onRetry, onNew, onSources }: Props) {
  const outcome = outcomeText(state);
  const decisions = keyDecisions(state);
  const cards = unlockedCards(state);
  const won = state.status === 'won';

  return (
    <main class="page debrief-page">
      <header class={`outcome ${won ? 'outcome-won' : 'outcome-lost'}`}>
        <p class="kicker">Mission debrief · {mission.title} · Seed {mission.seed}</p>
        <h1>
          <span aria-hidden="true">{won ? '🏆' : '🛬'}</span> {outcome.title}
        </h1>
        <p class="lead">{outcome.text}</p>
        <DataBadge status={mission.status} />
      </header>

      <section class="final-stats" aria-label="Final numbers">
        <div><span aria-hidden="true">❤️</span> Life Support <strong>{state.life}</strong></div>
        <div><span aria-hidden="true">☢️</span> Dose <strong>{Math.round(state.dose)}</strong> of {CONFIG.doseLimit} mSv</div>
        <div><span aria-hidden="true">🔋</span> Battery <strong>{state.battery}</strong></div>
        <div><span aria-hidden="true">🔬</span> Samples <strong>{state.science}</strong> of {CONFIG.scienceGoal}</div>
      </section>

      <div class="debrief-btns">
        <Button kind="primary" autoFocus onClick={onRetry}>↺ Try again (same seed)</Button>
        <Button kind="primary" onClick={onNew}>🚀 New mission</Button>
        <Button kind="ghost" onClick={onSources}>🔎 The Science Behind This</Button>
      </div>

      <section class="panel">
        <h2>The choices that mattered most</h2>
        {decisions.length === 0 && <p>You kept things steady the whole way. No single choice stood out.</p>}
        <ol class="decisions">
          {decisions.map((d) => (
            <li key={d.title} class={`decision decision-${d.tone}`}>
              <h3>
                <span aria-hidden="true">{d.tone === 'good' ? '👍' : '⚠️'}</span> {d.title}
              </h3>
              <p>{d.why}</p>
            </li>
          ))}
        </ol>
        <p class="lesson">
          <strong>The big idea:</strong> on Mars there is never enough power for everything. Protecting the crew from a
          solar storm means doing less science that sol.
        </p>
      </section>

      <section class="panel">
        <h2>Mission timeline</h2>
        <div class="table-wrap">
          <table class="timeline">
            <thead>
              <tr>
                <th scope="col">Sol</th>
                <th scope="col">Power</th>
                <th scope="col"><span aria-hidden="true">❤️</span> Life</th>
                <th scope="col"><span aria-hidden="true">🛡️</span> Shield</th>
                <th scope="col"><span aria-hidden="true">📡</span> Comms</th>
                <th scope="col"><span aria-hidden="true">🔬</span> Science</th>
                <th scope="col">What happened</th>
                <th scope="col">Dose</th>
                <th scope="col">Life Support</th>
              </tr>
            </thead>
            <tbody>
              {state.history.map((r) => {
                const events: string[] = [];
                if (r.storm) events.push(`☀️ ${stormName(r)}${r.storm.source ? ` (flare ${r.storm.source.classType})` : ''}${r.forecast ? '' : ', no warning'}`);
                if (r.dust) events.push(`🌫️ dust${r.coldNight ? ', cold night' : ''}`);
                if (r.small === 'wear') events.push('🔧 part wore out');
                if (r.small === 'harvest') events.push('🥬 harvest');
                return (
                  <tr key={r.sol}>
                    <th scope="row">{r.sol}</th>
                    <td>{r.solar} + {r.batteryBefore}</td>
                    <td>{r.alloc.life}</td>
                    <td>{r.alloc.shield}</td>
                    <td>{r.alloc.comms}</td>
                    <td>{r.alloc.science}</td>
                    <td class="ev">{events.length ? events.join('; ') : 'calm'}</td>
                    <td>+{Math.round(r.doseAdded)}</td>
                    <td>{r.lifeAfter}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="small">Power = cells from the Sun + cells in the battery that morning. The other numbers are the cells you gave each system.</p>
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
                  <span aria-hidden="true">{t.icon}</span> {t.title}
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
