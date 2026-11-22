import type {
  FacilityKind,
  GameDocument,
  Tank,
  TankEvent,
} from "../../../shared/types";
import { FACILITIES, RULES, fishSpace } from "./rules";
import type { RepairPlan } from "../lib/solver";
import {
  evaluate,
  simFromTank,
  simulate,
  spaceUsed,
  tankHealthy,
} from "../lib/simulate";

let facilitySeq = 0;
function facilityId(now: number) {
  facilitySeq = (facilitySeq + 1) % 1000;
  return `fac-${now.toString(36)}-${facilitySeq}`;
}

/** 任何水箱编辑都会使既有保障失效（确认方案时重新设立）。 */
function invalidate(tank: Tank): Tank {
  return tank.guaranteeUntil === null ? tank : { ...tank, guaranteeUntil: null };
}

export function addFishToTank(
  doc: GameDocument,
  catchId: string,
): GameDocument {
  const tank = doc.tank;
  const item = doc.bag.find((c) => c.id === catchId);
  if (!item || tank.fish.some((f) => f.catchId === catchId)) return doc;
  const sim = simFromTank(tank, doc.bag);
  if (spaceUsed(sim) + fishSpace(item.weight) > RULES.capacity) return doc;
  return {
    ...doc,
    tank: invalidate({
      ...tank,
      fish: [...tank.fish, { catchId, pinned: false }],
      condition: {
        ...tank.condition,
        [catchId]: tank.condition[catchId] ?? { stress: 0, satiety: 80 },
      },
    }),
  };
}

/** 移回背包：鱼仍在 bag 中，只是不再计入水箱，数量守恒。 */
export function removeFishFromTank(
  doc: GameDocument,
  catchId: string,
): GameDocument {
  const tank = doc.tank;
  const entry = tank.fish.find((f) => f.catchId === catchId);
  if (!entry || entry.pinned) return doc;
  const condition = { ...tank.condition };
  delete condition[catchId];
  return {
    ...doc,
    tank: invalidate({
      ...tank,
      fish: tank.fish.filter((f) => f.catchId !== catchId),
      condition,
    }),
  };
}

export function addFacility(
  doc: GameDocument,
  kind: FacilityKind,
  now: number,
): GameDocument {
  const tank = doc.tank;
  const sim = simFromTank(tank, doc.bag);
  if (spaceUsed(sim) + FACILITIES[kind].space > RULES.capacity) return doc;
  return {
    ...doc,
    tank: invalidate({
      ...tank,
      facilities: [
        ...tank.facilities,
        { id: facilityId(now), kind, pinned: false },
      ],
    }),
  };
}

export function removeFacility(doc: GameDocument, id: string): GameDocument {
  const tank = doc.tank;
  const target = tank.facilities.find((f) => f.id === id);
  if (!target || target.pinned) return doc;
  return {
    ...doc,
    tank: invalidate({
      ...tank,
      facilities: tank.facilities.filter((f) => f.id !== id),
    }),
  };
}

export function toggleFishPin(doc: GameDocument, catchId: string): GameDocument {
  const tank = doc.tank;
  if (!tank.fish.some((f) => f.catchId === catchId)) return doc;
  return {
    ...doc,
    tank: invalidate({
      ...tank,
      fish: tank.fish.map((f) =>
        f.catchId === catchId ? { ...f, pinned: !f.pinned } : f,
      ),
    }),
  };
}

export function toggleFacilityPin(doc: GameDocument, id: string): GameDocument {
  const tank = doc.tank;
  if (!tank.facilities.some((f) => f.id === id)) return doc;
  return {
    ...doc,
    tank: invalidate({
      ...tank,
      facilities: tank.facilities.map((f) =>
        f.id === id ? { ...f, pinned: !f.pinned } : f,
      ),
    }),
  };
}

/**
 * 应用修复方案：移鱼回背包、增减设施。
 * 应用后按同一引擎复核未来六小时，通过才设立健康保障。
 */
export function applyPlan(
  doc: GameDocument,
  plan: RepairPlan,
  now: number,
): { doc: GameDocument; guaranteed: boolean } {
  let tank = doc.tank;
  const removedFish = new Set(plan.removeFish);
  const removedFac = new Set(plan.removeFacilities);
  const condition = { ...tank.condition };
  for (const id of plan.removeFish) delete condition[id];
  tank = {
    ...tank,
    fish: tank.fish.filter((f) => !removedFish.has(f.catchId)),
    facilities: tank.facilities.filter((f) => !removedFac.has(f.id)),
    condition,
    guaranteeUntil: null,
  };
  tank = {
    ...tank,
    facilities: [
      ...tank.facilities,
      ...plan.addFacilities.map((kind) => ({
        id: facilityId(now),
        kind,
        pinned: false,
      })),
    ],
  };
  const summary = evaluate(
    simFromTank(tank, doc.bag),
    now,
    RULES.guaranteeHours * 60,
  );
  const guaranteed = summary.healthy;
  return {
    doc: {
      ...doc,
      tank: {
        ...tank,
        guaranteeUntil: guaranteed
          ? now + RULES.guaranteeHours * 3600_000
          : null,
      },
    },
    guaranteed,
  };
}

/**
 * 按真实时间推进水箱生态（同一引擎），单次最多补算六小时。
 * 返回同一 doc 引用表示没有到期可推进的时间。
 */
export function advanceTank(
  doc: GameDocument,
  now: number,
  collect?: TankEvent[],
): GameDocument {
  const tank = doc.tank;
  const elapsedMin = Math.floor((now - tank.lastTick) / 60000);
  if (elapsedMin <= 0) return doc;
  const capMin = RULES.offlineCapHours * 60;
  const minutes = Math.min(elapsedMin, capMin);
  const startMs = now - minutes * 60000;
  const events: TankEvent[] = [];
  let streak = tank.healthStreakH;
  let best = tank.bestStreakH;
  const final = simulate(
    simFromTank(tank, doc.bag),
    startMs,
    minutes,
    (s) => {
      streak = tankHealthy(s) ? streak + RULES.stepMin / 60 : 0;
      if (streak > best) best = streak;
    },
    events,
  );
  const weightById = new Map(final.fish.map((f) => [f.id, f.weight]));
  const bag = doc.bag.map((c) =>
    weightById.has(c.id) ? { ...c, weight: weightById.get(c.id)! } : c,
  );
  const condition = { ...tank.condition };
  for (const f of final.fish)
    condition[f.id] = { stress: f.stress, satiety: f.satiety };
  const next: Tank = {
    ...tank,
    oxygen: final.oxygen,
    hypoxiaMin: final.hypoxiaMin,
    fasting: final.fasting,
    condition,
    lastTick: elapsedMin > capMin ? now : tank.lastTick + minutes * 60000,
    healthStreakH: streak,
    bestStreakH: best,
    events: [...tank.events, ...events].slice(-40),
  };
  if (collect) collect.push(...events);
  return { ...doc, bag, tank: next };
}
