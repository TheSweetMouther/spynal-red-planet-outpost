import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { badgeText, type DataStatus } from '../data/loader';
import { GLOSSARY, type TermId } from './copy';

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

export function Meter(props: {
  icon: string;
  label: ComponentChildren;
  value: number;
  max: number;
  text: string;
  /** 'ok' | 'warn' | 'danger' also shown as a word, never by color alone. */
  level: 'ok' | 'warn' | 'danger';
  /** Draw a marker (e.g. the goal line). */
  marker?: number;
  kind?: string;
}) {
  const pct = Math.max(0, Math.min(100, (props.value / props.max) * 100));
  const word = props.level === 'ok' ? 'OK' : props.level === 'warn' ? 'Careful' : 'Danger';
  return (
    <div class={`meter meter-${props.level} ${props.kind ?? ''}`}>
      <div class="meter-head">
        <span class="meter-icon" aria-hidden="true">{props.icon}</span>
        <span class="meter-label">{props.label}</span>
        <span class="meter-state">
          {props.level === 'ok' ? '✓' : props.level === 'warn' ? '!' : '‼'} {word}
        </span>
      </div>
      <div
        class="meter-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={props.max}
        aria-valuenow={Math.round(props.value)}
        aria-valuetext={props.text}
      >
        <div class="meter-fill" style={{ width: `${pct}%` }} />
        {props.marker !== undefined && <div class="meter-marker" style={{ left: `${(props.marker / props.max) * 100}%` }} />}
      </div>
      <div class="meter-text">{props.text}</div>
    </div>
  );
}

/** LIVE / ARCHIVED / GAME badge. The word is always spelled out. */
export function DataBadge({ status }: { status: DataStatus | null }) {
  if (!status)
    return (
      <span class="badge badge-game" title="These storms were made up by the game.">
        🎲 GAME EVENTS · not real data
      </span>
    );
  const live = status.kind === 'live';
  return (
    <span
      class={`badge ${live ? 'badge-live' : 'badge-archived'}`}
      title={live ? `Downloaded just now from ${status.source}` : `Saved copy. Downloaded ${status.fetchedAt.slice(0, 10)} from: ${status.source}`}
    >
      {live ? '🟢' : '📦'} {badgeText(status)}
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
      onClick={props.onClick}
    >
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
