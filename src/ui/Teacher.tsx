import { CONFIG } from '../sim/config';
import { Button } from './components';

export function Teacher({ onBack }: { onBack: () => void }) {
  return (
    <main class="page text-page">
      <Button kind="ghost" onClick={onBack}>← Back</Button>
      <h1>🍎 For teachers and parents</h1>
      <p class="lead">
        Red Planet Outpost is a turn-based game for ages 7–12. One mission takes about 15 minutes. There is no timer, no
        account, no ads and no tracking.
      </p>

      <section class="panel">
        <h2>What children learn</h2>
        <p>
          After one mission, a child should be able to explain a real limit of living on Mars, for example: “There isn't
          enough power for everything, so protecting the crew from a solar storm means doing less science.”
        </p>
        <ul>
          <li><strong>Trade-offs:</strong> every power cell can only be used once.</li>
          <li><strong>Space weather:</strong> solar flares and particle storms raise radiation dose.</li>
          <li><strong>Communication delay:</strong> help from Earth always arrives late.</li>
          <li><strong>Using data:</strong> the storms in replay missions come from real NASA records.</li>
        </ul>
      </section>

      <section class="panel">
        <h2>How to run it with a class (about 15 minutes of play)</h2>
        <ol>
          <li>Give everyone the same <strong>mission seed</strong> on the title screen. Same seed, same storms.</li>
          <li>Play sol 1 together with the tutorial on. Read the “What will happen” box aloud.</li>
          <li>Let pairs play the rest. Ask them to say <em>why</em> before each “End sol”.</li>
          <li>Compare debrief screens. Who collected {CONFIG.scienceGoal} samples? Whose crew took the least radiation?</li>
          <li>Press “Try again (same seed)” and test one new idea.</li>
        </ol>
      </section>

      <section class="panel">
        <h2>Discussion questions</h2>
        <ol>
          <li>Which system was hardest to give power to? Why?</li>
          <li>What did you give up when you powered the shield? Was it worth it?</li>
          <li>Why does a message from Earth arrive too late to help right away?</li>
          <li>What happened when dust covered the sky? How did the battery help?</li>
          <li>You can keep everyone perfectly safe by never going outside. Why is that still not a good mission?</li>
          <li>The game says some storms are “real data” and some are “game events”. Why does it matter to tell them apart?</li>
          <li>If you could add one machine to the outpost, what would it be?</li>
        </ol>
      </section>

      <section class="panel">
        <h2>Good to know</h2>
        <ul>
          <li>Losing is gentle. The crew always goes home safely and the debrief explains what happened.</li>
          <li>The game works with touch, mouse or keyboard (Tab to move, Enter or Space to press).</li>
          <li>Game numbers are scaled so a mission fits in 10 turns. The “Science Behind This” page lists every real value next to its game value.</li>
          <li>Replay missions work without internet once the page has loaded from your school server or computer.</li>
        </ul>
      </section>
    </main>
  );
}
