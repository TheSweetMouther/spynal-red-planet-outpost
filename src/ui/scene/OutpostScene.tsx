import type { Allocation, SystemId } from '../../sim/state';
import { StormStreaks, type StormShow } from './StormStreaks';

// The outpost diorama. Pure presentation: props in, SVG out. It never reads
// the simulation; the screens pass in what the player already sees.

export type SceneTime = 'day' | 'sunset' | 'night';

export interface SceneProps {
  time: SceneTime;
  /** Dust storm today: brown haze and a dim Sun. */
  dust: boolean;
  /** Solar panels producing power today (one panel per cell). */
  panelsLit: number;
  panelsTotal: number;
  /** Cells given to each system. Drives conduits, shield, dish and rover. */
  cells: Allocation;
  /** Most cells the shield can use. */
  shieldMax: number;
  /** A storm is forecast for today (the player has been warned). */
  stormWarned: boolean;
  /** Play the end-of-sol timelapse: the Sun sets, storm particles arrive, night falls. */
  cinematic?: boolean;
  /** Storm particles to show during the timelapse. */
  storm?: StormShow | null;
  /** A cell just moved: send one pulse along that system's conduit. */
  pulse?: { system: SystemId; id: number; back: boolean } | null;
}

const HORIZON = 300;
/** Where each conduit ends, and the lane it runs along. */
const MODULES = {
  life: { x: 580, lane: 344 },
  shield: { x: 742, lane: 351 },
  comms: { x: 870, lane: 358 },
  science: { x: 985, lane: 365 },
} as const;
const HUB_X = 500;

/** Plain-words summary for screen readers, e.g. "Outpost: 8 of 8 panels lit, shield on, rover outside." */
export function sceneSummary(p: SceneProps): string {
  const parts = [
    `${p.panelsLit} of ${p.panelsTotal} solar panels lit`,
    p.cells.life > 0 ? 'greenhouse powered' : 'greenhouse dark',
    p.cells.shield > 0 ? `shield on at ${Math.min(p.cells.shield, p.shieldMax)} of ${p.shieldMax}` : 'shield off',
    p.cells.comms > 0 ? 'comm dish pointing at Earth' : 'comm dish off',
    p.cells.science > 0 ? (p.stormWarned ? 'rover and crew outside during a storm warning' : 'rover and crew outside') : 'rover in the garage',
  ];
  const sky = p.time === 'night' ? 'Night' : p.dust ? 'Dust storm, dim Sun' : p.time === 'sunset' ? 'Sunset' : 'Clear day';
  return `Outpost. ${sky}. ${parts.join(', ')}.`;
}

/** 0 when a system has no cells, rising to 1 at `full` cells. */
const level = (cells: number, full: number) => Math.max(0, Math.min(1, cells / full));

export function OutpostScene(p: SceneProps) {
  const life = level(p.cells.life, 3);
  const shield = level(p.cells.shield, p.shieldMax);
  const comms = p.cells.comms > 0;
  const science = level(p.cells.science, 4);
  const outside = p.cells.science > 0;
  const danger = outside && p.stormWarned;
  const powered = p.panelsLit > 0;
  const conduit = (on: number) => ({ opacity: 0.16 + 0.84 * on, strokeWidth: 2.5 + 2.5 * on });

  return (
    <svg
      class={`scene scene-${p.cinematic ? 'cine' : p.time}${p.dust ? ' scene-dust' : ''}`}
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label={sceneSummary(p)}
    >
      <defs>
        <linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9a6537" />
          <stop offset="0.55" stop-color="#c98b4e" />
          <stop offset="1" stop-color="#e2b783" />
        </linearGradient>
        <linearGradient id="sky-sunset" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f2a3a" />
          <stop offset="0.5" stop-color="#6c5560" />
          <stop offset="0.85" stop-color="#a97a5c" />
          <stop offset="1" stop-color="#b88a66" />
        </linearGradient>
        <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#100f18" />
          <stop offset="0.7" stop-color="#262233" />
          <stop offset="1" stop-color="#3a2f3a" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7a4d33" />
          <stop offset="1" stop-color="#3f271d" />
        </linearGradient>
        <radialGradient id="sun-glow">
          <stop offset="0" stop-color="#fff3d6" stop-opacity="0.9" />
          <stop offset="0.35" stop-color="#ffe2ad" stop-opacity="0.45" />
          <stop offset="1" stop-color="#ffe2ad" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sun-glow-blue">
          <stop offset="0" stop-color="#e6f4ff" stop-opacity="0.95" />
          <stop offset="0.3" stop-color="#7db8e8" stop-opacity="0.7" />
          <stop offset="1" stop-color="#7db8e8" stop-opacity="0" />
        </radialGradient>
        <pattern id="hex" width="18" height="15.6" patternUnits="userSpaceOnUse">
          <path d="M4.5,0 L13.5,0 L18,7.8 L13.5,15.6 L4.5,15.6 L0,7.8 Z" fill="none" stroke="#7db8e8" stroke-width="1" />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Sky: three layers that cross-fade with the time of day */}
      <rect class="sky sky-day" width="1200" height={HORIZON + 4} fill="url(#sky-day)" />
      <rect class="sky sky-sunset" width="1200" height={HORIZON + 4} fill="url(#sky-sunset)" />
      <rect class="sky sky-night" width="1200" height={HORIZON + 4} fill="url(#sky-night)" />
      <g class="stars" fill="#fff">
        {[
          [250, 150, 1.4], [330, 205, 1], [455, 140, 1.2], [560, 190, 0.9], [640, 135, 1.3],
          [760, 175, 1], [845, 145, 1.5], [930, 210, 1], [985, 160, 1.1], [410, 240, 0.9], [700, 235, 0.8],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>

      {/* The Sun. On Mars it looks small, and at sunset the sky around it turns blue. */}
      <g class="sun">
        <circle class="sun-halo sun-halo-day" r="120" fill="url(#sun-glow)" />
        <circle class="sun-halo sun-halo-blue" r="130" fill="url(#sun-glow-blue)" />
        <circle class="sun-disc" r="13" fill="#fff6e2" />
      </g>

      {/* Far hills and the ground */}
      <path class="hills" d="M0,304 L0,272 Q120,238 260,264 T520,252 T800,268 T1040,248 T1200,270 L1200,304 Z" />
      <rect y={HORIZON} width="1200" height="100" fill="url(#ground)" />
      <g class="rocks">
        <ellipse cx="300" cy="384" rx="26" ry="7" />
        <ellipse cx="655" cy="390" rx="18" ry="5" />
        <ellipse cx="930" cy="386" rx="30" ry="8" />
        <ellipse cx="1100" cy="372" rx="16" ry="5" />
      </g>

      {/* Conduits: one lane per system. Brightness follows the cells assigned. */}
      <g class="conduits" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path class="conduit conduit-trunk" d={`M246,330 V354 H${HUB_X}`} style={conduit(powered ? 1 : 0)} />
        <path class="conduit" data-system="life" d={`M${HUB_X},${MODULES.life.lane} H${MODULES.life.x} V324`} style={conduit(life)} />
        <path class="conduit" data-system="shield" d={`M${HUB_X},${MODULES.shield.lane} H${MODULES.shield.x} V324`} style={conduit(shield)} />
        <path class="conduit" data-system="comms" d={`M${HUB_X},${MODULES.comms.lane} H${MODULES.comms.x} V324`} style={conduit(comms ? 1 : 0)} />
        <path class="conduit" data-system="science" d={`M${HUB_X},${MODULES.science.lane} H${MODULES.science.x} V326`} style={conduit(science)} />
        {p.pulse && (
          <path
            key={p.pulse.id}
            class={`conduit-pulse${p.pulse.back ? ' conduit-pulse-back' : ''}`}
            data-system={p.pulse.system}
            pathLength={100}
            d={`M${HUB_X},${MODULES[p.pulse.system].lane} H${MODULES[p.pulse.system].x} V325`}
          />
        )}
      </g>
      <rect class="hub" x={HUB_X - 9} y="338" width="18" height="32" rx="4" />

      {/* Solar panels: the number lit equals the cells made today */}
      <g class="panels">
        {Array.from({ length: p.panelsTotal }, (_, i) => {
          const x = 236 + i * 30;
          const lit = i < p.panelsLit;
          return (
            <g key={i} class={`panel-unit${lit ? ' panel-lit' : ''}`}>
              <line x1={x + 15} y1="318" x2={x + 15} y2="332" class="panel-post" />
              <polygon points={`${x},320 ${x + 24},320 ${x + 31},294 ${x + 7},294`} class="panel-face" />
              <line x1={x + 12} y1="320" x2={x + 19} y2="294" class="panel-grid" />
              <line x1={x + 3.5} y1="307" x2={x + 27.5} y2="307" class="panel-grid" />
            </g>
          );
        })}
      </g>

      {/* Greenhouse (Life Support) */}
      <g class="greenhouse" style={{ '--on': life }}>
        <path d="M554,324 A26,24 0 0 1 606,324 Z" class="glass" />
        <path d="M554,324 A26,24 0 0 1 606,324" class="glass-rim" />
        <path d="M566,324 v-8 m-4,3 l4,-3 l4,3 M580,324 v-11 m-5,4 l5,-4 l5,4 M594,324 v-8 m-4,3 l4,-3 l4,3" class="plants" />
        <rect x="552" y="322" width="56" height="5" rx="2" class="base" />
      </g>

      {/* Habitat, with the shield dome over it */}
      <g class="habitat">
        <path d="M672,324 A46,42 0 0 1 764,324 Z" class="hab-shell" />
        <path d="M690,324 v-16 a8,8 0 0 1 16,0 v16 Z" class="hab-door" />
        <rect x="722" y="298" width="20" height="11" rx="3" class="hab-window" />
        <rect x="668" y="322" width="100" height="5" rx="2" class="base" />
        <rect x="736" y="318" width="12" height="8" rx="2" class="shield-emitter" style={{ '--on': shield }} />
      </g>
      <g class="shield-dome" style={{ opacity: p.cells.shield > 0 ? 1 : 0 }} data-cells={Math.min(p.cells.shield, p.shieldMax)}>
        <path d="M642,324 A76,72 0 0 1 794,324 Z" fill="#7db8e8" style={{ opacity: 0.1 + 0.2 * shield }} />
        <path class="shield-hex" d="M642,324 A76,72 0 0 1 794,324 Z" fill="url(#hex)" style={{ opacity: 0.35 + 0.45 * shield }} />
        <path d="M642,324 A76,72 0 0 1 794,324" fill="none" stroke="#7db8e8" style={{ strokeWidth: 2 + 2 * shield, opacity: 0.6 + 0.4 * shield }} />
      </g>

      {/* Comm dish: turns to the sky and sends a pulse when powered */}
      <g class={`dish${comms ? ' dish-on' : ''}`}>
        <line x1="870" y1="324" x2="870" y2="292" class="mast" />
        <g class="dish-head" transform="translate(870 290)">
          <g class="dish-turn">
            <path d="M-17,0 A17,17 0 0 0 17,0 Z" class="dish-bowl" />
            <line x1="0" y1="0" x2="0" y2="-14" class="dish-feed" />
            <circle cx="0" cy="-15" r="2.6" class="dish-tip" />
            <g class="dish-pulse" fill="none">
              <path d="M-7,-24 A10,10 0 0 1 7,-24" />
              <path d="M-12,-33 A17,17 0 0 1 12,-33" />
              <path d="M-17,-42 A24,24 0 0 1 17,-42" />
            </g>
          </g>
        </g>
        <rect x="858" y="322" width="24" height="5" rx="2" class="base" />
      </g>

      {/* Rover garage, and the rover and crew outside when Science has power */}
      <g class="garage">
        <rect x="962" y="302" width="46" height="24" rx="4" class="garage-shell" />
        <rect x="974" y="310" width="22" height="16" rx="2" class={`garage-door${outside ? ' garage-open' : ''}`} />
      </g>
      <g class={`rover${outside ? ' rover-out' : ''}${danger ? ' rover-danger' : ''}`} data-outside={outside ? 'yes' : 'no'}>
        <g transform="translate(1046 0)">
          <rect x="-20" y="326" width="40" height="12" rx="3" class="rover-body" />
          <line x1="8" y1="326" x2="8" y2="312" class="rover-mast" />
          <rect x="3" y="307" width="11" height="6" rx="1.5" class="rover-cam" />
          <circle cx="-13" cy="341" r="5.5" class="wheel" />
          <circle cx="0" cy="341" r="5.5" class="wheel" />
          <circle cx="13" cy="341" r="5.5" class="wheel" />
        </g>
        <g transform="translate(1092 0)" class="crew">
          <circle cx="0" cy="320" r="5.5" class="helmet" />
          <rect x="-5" y="325" width="10" height="13" rx="3" class="suit" />
          <path d="M-3,338 v7 M3,338 v7" class="legs" />
        </g>
        {danger && (
          <g class="rover-alert" transform="translate(1068 284)">
            <path d="M0,-15 L15,11 H-15 Z" class="alert-tri" />
            <path d="M0,-6 V3 M0,7 v0.5" class="alert-mark" />
          </g>
        )}
        {danger && <rect x="1016" y="298" width="94" height="54" rx="10" class="rover-ring" />}
      </g>

      {p.cinematic && p.storm && <StormStreaks show={p.storm} />}

      {/* Dust haze over everything on dust-storm sols */}
      <rect class="haze" width="1200" height="400" fill="#6b4a33" />
    </svg>
  );
}
