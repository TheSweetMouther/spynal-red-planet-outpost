import factsFile from '../data/facts.json';
import { CONFIG } from '../sim/config';
import type { SystemId } from '../sim/state';
import { SCALE_NOTE, type CardId } from '../sim/debrief';

export const FACTS = factsFile.facts;
export const CARD_SOURCES = factsFile.cards;
export const FACTS_CHECKED = factsFile.checked;

export const SYSTEM_INFO: Record<SystemId, { icon: string; name: string; short: string; help: string }> = {
  life: {
    icon: '❤️',
    name: 'Life Support',
    short: 'Air, water, food',
    help: `Needs ${CONFIG.lifeNeed} cells every sol. Fewer, and it drops.`,
  },
  shield: {
    icon: '🛡️',
    name: 'Shielding',
    short: 'Storm shelter',
    help: `Each cell blocks ${CONFIG.shieldPerCell * 100}% of a solar storm for the crew inside. Up to ${CONFIG.shieldMaxCells} cells. No storm, nothing to block.`,
  },
  comms: {
    icon: '📡',
    name: 'Comms',
    short: 'Talk to Earth',
    help: '1 cell brings a forecast from Earth tomorrow.',
  },
  science: {
    icon: '🔬',
    name: 'Science',
    short: 'Rover and samples',
    help: 'Each cell collects 1 sample. Working outside adds radiation, and a lot more in a storm.',
  },
};

export type TermId = 'sol' | 'dose' | 'flare' | 'shielding' | 'commdelay' | 'microgravity' | 'sep' | 'msv';

export const GLOSSARY: Record<TermId, { term: string; text: string }> = {
  sol: {
    term: 'sol',
    text: `A sol is one day on Mars. It lasts ${FACTS.sol_length.display}, a bit longer than a day on Earth.`,
  },
  dose: {
    term: 'radiation dose',
    text: `Radiation is invisible energy from the Sun and from deep space. Your dose is how much your body has soaked up so far. It only goes up. ${SCALE_NOTE}`,
  },
  flare: {
    term: 'solar flare',
    text: 'A solar flare is a giant flash of energy on the Sun. Scientists sort flares by size: C is small, M is medium, X is big.',
  },
  shielding: {
    term: 'shielding',
    text: 'Shielding is stuff that blocks radiation, like thick walls or tanks of water. The crew hides behind it during a storm.',
  },
  commdelay: {
    term: 'comm delay',
    text: `Radio messages travel at the speed of light, but Mars is very far. A message takes ${FACTS.light_delay_min.value} to ${FACTS.light_delay_max.value} minutes each way.`,
  },
  microgravity: {
    term: 'microgravity',
    text: 'Microgravity is the floating feeling in space. Without weight to push against, bones and muscles get weaker.',
  },
  sep: {
    term: 'particle blast',
    text: 'Sometimes a solar storm shoots out very fast particles. Scientists call this a solar energetic particle event. It makes radiation jump.',
  },
  msv: {
    term: 'mSv',
    text: 'mSv is short for millisievert. It is the unit scientists use to measure radiation dose.',
  },
};

export const CARD_TEXT: Record<CardId, { icon: string; title: string; body: string }> = {
  radiation: {
    icon: '☢️',
    title: 'What radiation does to cells',
    body: 'Scientists hit human lung cells with gamma rays and with heavy particles like the ones in space. Then they watched which genes switched on over the next 24 hours. Different kinds of radiation made the cells react in different ways.',
  },
  iss_compare: {
    icon: '🛰️',
    title: 'Mars vs. the Space Station',
    body: `On the ground on Mars, the Curiosity rover measured about ${FACTS.mars_surface_dose_eq.value} mSv of radiation per day. On the flight to Mars it measured ${FACTS.cruise_dose_eq.value} mSv per day, almost 3 times as much. Detectors inside the Space Station soak up radiation about as fast as Curiosity does on Mars. But a Mars trip lasts much longer, so the dose adds up.`,
  },
  food: {
    icon: '🥬',
    title: 'Growing food far from home',
    body: 'Fresh food cannot be shipped to Mars every week. The Canadian Space Agency made a toolkit for students about growing food on the Moon and in remote places on Earth.',
  },
  muscle: {
    icon: '💪',
    title: 'Muscles need work',
    body: 'In one study, 14 men stayed in bed for 21 days. Scientists checked how their leg muscles changed when they were not used. Astronauts in microgravity have the same problem, so they exercise every day.',
  },
  bone: {
    icon: '🦴',
    title: 'Bones in space',
    body: 'Mice lived on the Space Station for 33 days. In microgravity they lost muscle and bone. Scientists tested a treatment that blocks two body signals, and it helped protect both.',
  },
  sleep: {
    icon: '😴',
    title: 'Your body clock in space',
    body: 'Scientists put together data from many space missions and astronauts. They found that spaceflight changes how cells make energy. It also changes the genes that run the body clock, which tells you when to sleep.',
  },
};

export const KID_DELAY_LINE =
  'Radio messages travel at light speed, but Mars is so far away that answers come back too late to help right now.';
