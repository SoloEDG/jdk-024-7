import type { GameDocument, Session, Tank } from "./types";
export function emptyTank(now: number): Tank {
  return {
    fish: [],
    facilities: [],
    oxygen: 6.8,
    hypoxiaMin: 0,
    fasting: false,
    condition: {},
    lastTick: now,
    healthStreakH: 0,
    bestStreakH: 0,
    guaranteeUntil: null,
    events: [],
  };
}
export function newDocument(): GameDocument {
  return {
    version: 1,
    spot: "reed",
    bait: "worm",
    power: 0.6,
    drag: 0.4,
    seed: 48127,
    stock: { worm: 24, corn: 20, fly: 16 },
    bag: [],
    journal: {},
    stats: { casts: 0, catches: 0, escapes: 0, released: 0 },
    claimed: [],
    tank: emptyTank(Date.now()),
  };
}
export function idleSession(): Session {
  return {
    id: "",
    phase: "ready",
    clock: 0,
    charge: 0,
    castPower: 0,
    spot: "reed",
    bait: "worm",
    fish: null,
    weight: 0,
    biteAt: 2,
    progress: 0,
    tension: 0.35,
    energy: 1,
    slackTime: 0,
    overload: 0,
    peak: 0,
    reeling: false,
    duration: 0,
    message: "深呼吸，把时间交给湖面。",
  };
}
export function isBusy(s: Session) {
  return ["charging", "waiting", "bite", "fighting"].includes(s.phase);
}
