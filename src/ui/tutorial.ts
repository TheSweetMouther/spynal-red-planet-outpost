// Remembers that the player has finished or skipped the tutorial, so it is
// shown on the first mission only. Storage can be missing or blocked (private
// mode), so every read and write is wrapped in try/catch.

export const TUTORIAL_KEY = 'red-planet-outpost.tutorialDone';

export interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): FlagStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** True once the player has finished or skipped the tutorial. */
export function isTutorialDone(store: FlagStore | null = browserStore()): boolean {
  try {
    return store?.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone(store: FlagStore | null = browserStore()): void {
  try {
    store?.setItem(TUTORIAL_KEY, '1');
  } catch {
    // Nothing to do: the tutorial will simply show again next time.
  }
}

/**
 * Should the next mission start with the tutorial?
 * Yes on the first mission, and whenever the player asked for a replay.
 */
export function shouldShowTutorial(replayAsked: boolean, store: FlagStore | null = browserStore()): boolean {
  return replayAsked || !isTutorialDone(store);
}
