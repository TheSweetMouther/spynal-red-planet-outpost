import { makeRng } from '../../sim/rng';

// Storm particles for the end-of-sol timelapse. Pure presentation.
// The streaks are placed by a seeded RNG, so a replay of the same mission and
// sol looks the same. The share of streaks the dome turns away equals the
// share of the storm the shield really blocked.

export interface StormShow {
  /** Share of the storm the shield blocked for the crew inside, 0 to 1. */
  blocked: number;
  /** How many streaks aim at the habitat (more for bigger storms). */
  count: number;
  /** The rover and crew are outside. */
  outside: boolean;
  seed: number;
}

/** The shield dome: centre and radii, matching OutpostScene. */
const DOME = { cx: 718, cy: 324, rx: 76, ry: 72 };

export interface Streak {
  kind: 'deflected' | 'hit' | 'rover' | 'ground';
  d: string;
  /** Where the streak ends (for the small flash). */
  x: number;
  y: number;
  delay: number;
}

/** Build the streaks. Exported so the ratio can be checked. */
export function buildStreaks(show: StormShow): Streak[] {
  const rng = makeRng(show.seed);
  const out: Streak[] = [];
  const deflectedCount = Math.round(show.count * Math.max(0, Math.min(1, show.blocked)));
  const from = (tx: number, ty: number) => ({ sx: tx + 250 + rng.next() * 130, sy: ty - 225 - rng.next() * 50 });
  const delay = () => 0.55 + rng.next() * 1.25;

  for (let i = 0; i < show.count; i++) {
    const tx = 688 + rng.next() * 62;
    const ty = 312;
    const { sx, sy } = from(tx, ty);
    if (i < deflectedCount) {
      // Walk along the streak until it meets the dome, then bounce away.
      let hx = sx;
      let hy = sy;
      for (let t = 0; t <= 1; t += 0.01) {
        hx = sx + (tx - sx) * t;
        hy = sy + (ty - sy) * t;
        if (((hx - DOME.cx) / DOME.rx) ** 2 + ((hy - DOME.cy) / DOME.ry) ** 2 <= 1) break;
      }
      const nx = (hx - DOME.cx) / DOME.rx;
      const ny = (hy - DOME.cy) / DOME.ry;
      const bx = hx + nx * 70 + 20;
      const by = hy + ny * 70 - 25;
      out.push({ kind: 'deflected', d: `M${sx.toFixed(1)},${sy.toFixed(1)} L${hx.toFixed(1)},${hy.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)}`, x: hx, y: hy, delay: delay() });
    } else {
      out.push({ kind: 'hit', d: `M${sx.toFixed(1)},${sy.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`, x: tx, y: ty, delay: delay() });
    }
  }
  if (show.outside)
    for (let i = 0; i < Math.max(4, Math.round(show.count / 3)); i++) {
      const tx = 1030 + rng.next() * 66;
      const ty = 322 + rng.next() * 10;
      const { sx, sy } = from(tx, ty);
      out.push({ kind: 'rover', d: `M${sx.toFixed(1)},${sy.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`, x: tx, y: ty, delay: delay() });
    }
  for (let i = 0; i < Math.round(show.count / 2); i++) {
    const tx = 240 + rng.next() * 820;
    const ty = 345 + rng.next() * 40;
    const { sx, sy } = from(tx, ty);
    out.push({ kind: 'ground', d: `M${sx.toFixed(1)},${sy.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`, x: tx, y: ty, delay: delay() });
  }
  return out;
}

export function StormStreaks({ show }: { show: StormShow }) {
  return (
    <g class="streaks" aria-hidden="true">
      {buildStreaks(show).map((s, i) => (
        <g key={i} class={`streak streak-${s.kind}`} style={{ '--delay': `${s.delay.toFixed(2)}s` }}>
          <path d={s.d} pathLength={1} />
          {s.kind !== 'ground' && <circle cx={s.x} cy={s.y} r={s.kind === 'deflected' ? 5 : 7} />}
        </g>
      ))}
    </g>
  );
}
