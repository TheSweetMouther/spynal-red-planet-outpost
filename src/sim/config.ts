// All tunable game constants live here. scripts/balance.ts checks that these
// values keep the trade-offs honest. Real-world numbers live in
// src/data/facts.json; the Sources page explains how each one was scaled.

export const CONFIG = {
  /** Mission length in sols. */
  sols: 10,

  // ---- Power ----
  /** Power cells made by the solar panels on a clear sol. */
  solarClear: 8,
  /** Power cells made during a dust storm. */
  solarDust: 4,
  /** Most cells the battery can hold. */
  batteryMax: 6,
  /** Battery charge at landing. */
  batteryStart: 2,
  /** Saving loses 1 cell out of every `chargeLossEvery` cells saved in one sol. */
  chargeLossEvery: 3,
  /** Cells the heaters pull from the battery on each dust-storm night. */
  dustNightDraw: 1,

  // ---- Life Support ----
  lifeStart: 100,
  lifeMax: 100,
  /** Cells needed each sol to hold Life Support steady. */
  lifeNeed: 3,
  /** Life Support lost for each cell short of `lifeNeed`. */
  lifeLossPerMissing: 15,
  /** Life Support gained for each cell above `lifeNeed`. */
  lifeGainPerExtra: 6,
  /** Life Support lost on a dust-storm night with an empty battery. */
  coldNightLoss: 12,
  /** Game event: a part wears out. */
  wearLoss: 10,
  /** Game event: a good greenhouse harvest. */
  harvestGain: 10,

  // ---- Radiation (game-scaled mSv) ----
  /**
   * One game sol stands in for `solScale` real sols, so a 10-sol game is like
   * a 500-sol surface stay. Baseline dose per game sol = real 0.64 mSv/day
   * (Curiosity RAD) x 1.0275 days per sol x 50, rounded.
   */
  solScale: 50,
  baseDose: 33,
  /** Mission dose limit. Equal to NASA's real career limit (600 mSv). */
  doseLimit: 600,
  /** Unshielded storm dose by severity. Scaled up for play (see Sources page). */
  stormDose: { minor: 15, moderate: 40, severe: 80 },
  /** A linked particle event (SEP) multiplies the storm dose. */
  sepMultiplier: 2.5,
  /**
   * Each Shielding cell blocks this share of today's storm dose for the crew
   * inside. The everyday cosmic-ray dose (baseDose) is not blocked.
   */
  shieldPerCell: 0.4,
  /** Shielding cells beyond this do nothing. */
  shieldMaxCells: 2,
  /** Extra dose for each Science cell (time outside on an EVA). */
  evaDose: 5,
  /** Share of today's storm dose each Science cell adds (crew outside the shelter). */
  evaStormShare: 0.5,
  /** The crew outside can never get more than this many times the storm dose. */
  evaStormMax: 1,

  // ---- Science ----
  /** Science points earned for each Science cell. */
  sciencePerCell: 1,
  /** Points needed by the end of the mission. */
  scienceGoal: 22,
  /** Extra samples for each bonus star: goal = 1 star, goal + 5 = 2, goal + 10 = 3. */
  starStep: 5,

  // ---- Random mission generator ----
  random: {
    stormsMin: 3,
    stormsMax: 4,
    severityWeights: { minor: 0.4, moderate: 0.4, severe: 0.2 },
    sepChance: { minor: 0, moderate: 0.25, severe: 0.6 },
  },
  /** Chance a mission has a dust storm, and how long it lasts. */
  dustChance: 0.75,
  dustLength: 3,
  dustStartMin: 3,
  dustStartMax: 7,
} as const;

export type Config = typeof CONFIG;
