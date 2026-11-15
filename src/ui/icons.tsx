// Phosphor Icons (duotone), bundled as inline SVG so the game works offline.
// Each icon is imported by name; only these files end up in the bundle.
import archive from '@phosphor-icons/core/assets/duotone/archive-duotone.svg?raw';
import arrowCounterClockwise from '@phosphor-icons/core/assets/duotone/arrow-counter-clockwise-duotone.svg?raw';
import arrowDown from '@phosphor-icons/core/assets/duotone/arrow-down-duotone.svg?raw';
import arrowLeft from '@phosphor-icons/core/assets/duotone/arrow-left-duotone.svg?raw';
import arrowRight from '@phosphor-icons/core/assets/duotone/arrow-right-duotone.svg?raw';
import arrowUp from '@phosphor-icons/core/assets/duotone/arrow-up-duotone.svg?raw';
import barbell from '@phosphor-icons/core/assets/duotone/barbell-duotone.svg?raw';
import batteryCharging from '@phosphor-icons/core/assets/duotone/battery-charging-duotone.svg?raw';
import bed from '@phosphor-icons/core/assets/duotone/bed-duotone.svg?raw';
import bone from '@phosphor-icons/core/assets/duotone/bone-duotone.svg?raw';
import bookOpen from '@phosphor-icons/core/assets/duotone/book-open-duotone.svg?raw';
import broadcast from '@phosphor-icons/core/assets/duotone/broadcast-duotone.svg?raw';
import caretDown from '@phosphor-icons/core/assets/duotone/caret-down-duotone.svg?raw';
import caretUp from '@phosphor-icons/core/assets/duotone/caret-up-duotone.svg?raw';
import carrot from '@phosphor-icons/core/assets/duotone/carrot-duotone.svg?raw';
import cellSignalFull from '@phosphor-icons/core/assets/duotone/cell-signal-full-duotone.svg?raw';
import chalkboardTeacher from '@phosphor-icons/core/assets/duotone/chalkboard-teacher-duotone.svg?raw';
import chartBar from '@phosphor-icons/core/assets/duotone/chart-bar-duotone.svg?raw';
import checkCircle from '@phosphor-icons/core/assets/duotone/check-circle-duotone.svg?raw';
import clipboardText from '@phosphor-icons/core/assets/duotone/clipboard-text-duotone.svg?raw';
import diceFive from '@phosphor-icons/core/assets/duotone/dice-five-duotone.svg?raw';
import flask from '@phosphor-icons/core/assets/duotone/flask-duotone.svg?raw';
import heartbeat from '@phosphor-icons/core/assets/duotone/heartbeat-duotone.svg?raw';
import hourglass from '@phosphor-icons/core/assets/duotone/hourglass-duotone.svg?raw';
import lightbulb from '@phosphor-icons/core/assets/duotone/lightbulb-duotone.svg?raw';
import lightning from '@phosphor-icons/core/assets/duotone/lightning-duotone.svg?raw';
import magnifyingGlass from '@phosphor-icons/core/assets/duotone/magnifying-glass-duotone.svg?raw';
import minus from '@phosphor-icons/core/assets/duotone/minus-duotone.svg?raw';
import moonStars from '@phosphor-icons/core/assets/duotone/moon-stars-duotone.svg?raw';
import parachute from '@phosphor-icons/core/assets/duotone/parachute-duotone.svg?raw';
import planet from '@phosphor-icons/core/assets/duotone/planet-duotone.svg?raw';
import plant from '@phosphor-icons/core/assets/duotone/plant-duotone.svg?raw';
import play from '@phosphor-icons/core/assets/duotone/play-duotone.svg?raw';
import plus from '@phosphor-icons/core/assets/duotone/plus-duotone.svg?raw';
import question from '@phosphor-icons/core/assets/duotone/question-duotone.svg?raw';
import radioactive from '@phosphor-icons/core/assets/duotone/radioactive-duotone.svg?raw';
import rocketLaunch from '@phosphor-icons/core/assets/duotone/rocket-launch-duotone.svg?raw';
import shieldChevron from '@phosphor-icons/core/assets/duotone/shield-chevron-duotone.svg?raw';
import skipForward from '@phosphor-icons/core/assets/duotone/skip-forward-duotone.svg?raw';
import star from '@phosphor-icons/core/assets/duotone/star-duotone.svg?raw';
import starFill from '@phosphor-icons/core/assets/fill/star-fill.svg?raw';
import sun from '@phosphor-icons/core/assets/duotone/sun-duotone.svg?raw';
import sunHorizon from '@phosphor-icons/core/assets/duotone/sun-horizon-duotone.svg?raw';
import thermometerCold from '@phosphor-icons/core/assets/duotone/thermometer-cold-duotone.svg?raw';
import thumbsDown from '@phosphor-icons/core/assets/duotone/thumbs-down-duotone.svg?raw';
import thumbsUp from '@phosphor-icons/core/assets/duotone/thumbs-up-duotone.svg?raw';
import trophy from '@phosphor-icons/core/assets/duotone/trophy-duotone.svg?raw';
import warning from '@phosphor-icons/core/assets/duotone/warning-duotone.svg?raw';
import wind from '@phosphor-icons/core/assets/duotone/wind-duotone.svg?raw';
import wrench from '@phosphor-icons/core/assets/duotone/wrench-duotone.svg?raw';
import x from '@phosphor-icons/core/assets/duotone/x-duotone.svg?raw';

const ICONS = {
  // Systems
  life: heartbeat,
  shield: shieldChevron,
  comms: broadcast,
  science: flask,
  battery: batteryCharging,
  cell: lightning,
  radiation: radioactive,
  // Events and data
  flare: sunHorizon,
  sun,
  dust: wind,
  game: diceFive,
  live: cellSignalFull,
  archived: archive,
  night: moonStars,
  data: chartBar,
  // Actions and states
  close: x,
  search: magnifyingGlass,
  up: arrowUp,
  down: arrowDown,
  right: arrowRight,
  back: arrowLeft,
  retry: arrowCounterClockwise,
  play,
  plus,
  minus,
  skip: skipForward,
  more: caretDown,
  less: caretUp,
  ok: checkCircle,
  warning,
  question,
  idea: lightbulb,
  story: bookOpen,
  good: thumbsUp,
  bad: thumbsDown,
  star,
  starFull: starFill,
  trophy,
  landed: parachute,
  rocket: rocketLaunch,
  debrief: clipboardText,
  timer: hourglass,
  teacher: chalkboardTeacher,
  // Small events and science cards
  wrench,
  plant,
  cold: thermometerCold,
  planet,
  carrot,
  barbell,
  bone,
  bed,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * An inline icon. It takes the text color (or the color of a `tone-*` class).
 * Icons are decoration by default; pass `label` when the icon carries meaning
 * that the text next to it does not.
 */
export function Icon({ name, label, class: cls }: { name: IconName; label?: string; class?: string }) {
  return (
    <span
      class={`icon ${cls ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

/** One to three stars. Empty stars are outlines, so the count never depends on color. */
export function Stars({ count, of = 3 }: { count: number; of?: number }) {
  return (
    <span class="stars" role="img" aria-label={`${count} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <Icon key={i} name={i < count ? 'starFull' : 'star'} class={i < count ? 'star-on' : 'star-off'} />
      ))}
    </span>
  );
}
