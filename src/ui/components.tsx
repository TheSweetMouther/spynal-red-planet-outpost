import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { badgeText, type DataStatus } from '../data/loader';
import { GLOSSARY, type TermId } from './copy';
import { Icon, type IconName } from './icons';

const seenTerms = new Set<TermId>();

/** A glossary word. Tap, click or press Enter to read what it means. */
export function Term({ id, children }: { id: TermId; children?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const [isNew] = useState(() => {
    const fresh = !seenTerms.has(id);
    seenTerms.add(id);
    return fresh;
  });
  const tipId = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const g = GLOSSARY[id];

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <span class="term" ref={ref}>
      <button
        type="button"
        class={`term-btn${isNew ? ' term-new' : ''}`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen(!open)}
      >
        {children ?? g.term}
        <span class="term-q" aria-hidden="true">?</span>
      </button>
      {open && (
        <span class="term-tip" role="tooltip" id={tipId}>
          <strong>{g.term}:</strong> {g.text}
        </span>
      )}
    </span>
  );
}

export type Level = 'ok' | 'warn' | 'danger';
const LEVEL_WORD: Record<Level, string> = { ok: 'OK', warn: 'Careful', danger: 'Danger' };

/**
 * A compact meter for the outpost HUD: icon, name, number and a bar.
 * The state is also written as a word and, in danger, drawn with stripes and
 * a warning icon, so it never depends on color alone.
 */
export function HudBar(props: {
  icon: IconName;
  tone: string;
  label: ComponentChildren;
  value: number;
  max: number;
  /** The number shown next to the name, e.g. "63 / 600 mSv". */
  number: string;
  /** Full sentence for screen readers. */
  text: string;
  level: Level;
  /** Tick marks along the bar, as shares of the maximum (e.g. 0.25). */
  ticks?: number[];
  /** Split the bar into this many equal cells (battery). */
  segments?: number;
  children?: ComponentChildren;
}) {
  const pct = Math.max(0, Math.min(100, (props.value / props.max) * 100));
  return (
    <div class={`hud hud-${props.level} tone-${props.tone}`}>
      <div class="hud-head">
        <Icon name={props.icon} />
        <span class="hud-label">{props.label}</span>
        <span class="hud-num">{props.number}</span>
        {props.level !== 'ok' && (
          <span class="hud-state">
            <Icon name="warning" /> {LEVEL_WORD[props.level]}
          </span>
        )}
      </div>
      <div
        class="hud-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={props.max}
        aria-valuenow={Math.round(props.value)}
        aria-valuetext={`${props.text} ${LEVEL_WORD[props.level]}.`}
      >
        <div class="hud-fill" style={{ width: `${pct}%` }} />
        {(props.ticks ?? []).map((t) => (
          <span key={t} class="hud-tick" style={{ left: `${t * 100}%` }} />
        ))}
        {props.segments &&
          Array.from({ length: props.segments - 1 }, (_, i) => (
            <span key={i} class="hud-tick hud-gap" style={{ left: `${((i + 1) / props.segments!) * 100}%` }} />
          ))}
      </div>
      {props.children}
    </div>
  );
}

/** Live / Archived / Game badge. The word is always spelled out, with its own icon. */
export function DataBadge({ status }: { status: DataStatus | null }) {
  if (!status)
    return (
      <span class="badge badge-game" title="These storms were made up by the game.">
        <Icon name="game" /> GAME EVENTS · not real data
      </span>
    );
  const live = status.kind === 'live';
  return (
    <span
      class={`badge ${live ? 'badge-live' : 'badge-archived'}`}
      title={live ? `Downloaded just now from ${status.source}` : `Saved copy. Downloaded ${status.fetchedAt.slice(0, 10)} from: ${status.source}`}
    >
      <Icon name={live ? 'live' : 'archived'} /> {badgeText(status)}
    </span>
  );
}

export function Button(props: {
  onClick?: () => void;
  children: ComponentChildren;
  kind?: 'primary' | 'ghost' | 'plain';
  disabled?: boolean;
  class?: string;
  autoFocus?: boolean;
  icon?: IconName;
  /** For icon-only buttons. */
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.autoFocus) ref.current?.focus();
  }, [props.autoFocus]);
  return (
    <button
      ref={ref}
      type="button"
      class={`btn btn-${props.kind ?? 'plain'} ${props.class ?? ''}`}
      disabled={props.disabled}
      aria-label={props.label}
      onClick={props.onClick}
    >
      {props.icon && <Icon name={props.icon} />}
      {props.children}
    </button>
  );
}

export function SourceLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
