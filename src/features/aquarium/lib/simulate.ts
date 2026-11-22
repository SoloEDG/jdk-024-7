import type {
  Catch,
  FacilityKind,
  FishId,
  Tank,
  TankEvent,
} from "../../../shared/types";
import { species } from "../../../shared/catalog";
import { clamp } from "../../../shared/random";
import {
  DIET,
  FACILITIES,
  RULES,
  fishConsumption,
  fishSpace,
} from "../model/rules";

/** 生态模拟的瞬时状态。预览、修复求解与真实推进共用同一引擎。 */
export interface SimFish {
  id: string;
  fish: FishId;
  weight: number;
  stress: number;
  satiety: number;
}
export interface SimState {
  oxygen: number;
  hypoxiaMin: number;
  fasting: boolean;
  plants: number;
  airstones: number;
  shelters: number;
  fish: SimFish[];
}

export function simFromTank(tank: Tank, bag: Catch[]): SimState {
  const byId = new Map(bag.map((c) => [c.id, c]));
  const fish: SimFish[] = [];
  for (const tf of tank.fish) {
    const c = byId.get(tf.catchId);
    if (!c) continue;
    const cond = tank.condition[tf.catchId];
    fish.push({
      id: c.id,
      fish: c.fish,
      weight: c.weight,
      stress: cond?.stress ?? 0,
      satiety: cond?.satiety ?? 80,
    });
  }
  const count = (kind: FacilityKind) =>
    tank.facilities.filter((f) => f.kind === kind).length;
  return {
    oxygen: tank.oxygen,
    hypoxiaMin: tank.hypoxiaMin,
    fasting: tank.fasting,
    plants: count("plant"),
    airstones: count("airstone"),
    shelters: count("shelter"),
    fish,
  };
}

export function spaceUsed(s: SimState): number {
  return (
    s.fish.reduce((n, f) => n + fishSpace(f.weight), 0) +
    s.plants * FACILITIES.plant.space +
    s.airstones * FACILITIES.airstone.space +
    s.shelters * FACILITIES.shelter.space
  );
}

/** 掩体自动分配：掠食鱼按体重从大到小，各占一处，占满为止。 */
export function shelteredIds(s: SimState): Set<string> {
  const predators = s.fish
    .filter((f) => DIET[f.fish].shelter)
    .sort((a, b) => b.weight - a.weight);
  return new Set(predators.slice(0, s.shelters).map((f) => f.id));
}

export function localHour(tMs: number): number {
  const d = new Date(tMs);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
export function isDay(hour: number) {
  return hour >= RULES.dayStart && hour < RULES.dayEnd;
}

/** 整箱健康：溶氧、持续缺氧、空间与每尾鱼的应激同时达标，缺一不可。 */
export function tankHealthy(s: SimState): boolean {
  return breachReason(s) === null;
}
export function breachReason(s: SimState): string | null {
  if (spaceUsed(s) > RULES.capacity) return "空间超限";
  if (s.oxygen < RULES.critical) return "危急缺氧";
  if (s.oxygen < RULES.hypoxia) return "缺氧";
  if (s.fasting) return "持续缺氧未恢复";
  const stressed = s.fish.find((f) => f.stress >= RULES.stressUnhealthy);
  if (stressed) return `${species(stressed.fish).name} 应激过高`;
  return null;
}

/** 推进一个步长。out 传入数组时记录本步发生的阈值事件。 */
export function stepSim(
  prev: SimState,
  tMs: number,
  dtMin: number,
  out?: TankEvent[],
): SimState {
  const dtH = dtMin / 60;
  const day = isDay(localHour(tMs));
  const sheltered = shelteredIds(prev);
  const crowded = spaceUsed(prev) > RULES.capacity * RULES.crowdRatio;
  // —— 溶氧：水草昼夜相反，增氧石恒定，鱼持续耗氧 ——
  const supply =
    prev.plants * (day ? FACILITIES.plant.dayO2 : FACILITIES.plant.nightO2) +
    prev.airstones * FACILITIES.airstone.dayO2 +
    RULES.reaeration;
  let demand = 0;
  for (const f of prev.fish)
    demand += fishConsumption(f.weight, f.fish, {
      fasting: prev.fasting,
      satiety: f.satiety,
      stress: f.stress,
    });
  const oxygen = clamp(
    prev.oxygen + (supply - demand) * dtH,
    0,
    RULES.oxygenMax,
  );
  // —— 持续缺氧抑制进食，恢复需回升到更高阈值 ——
  const hypoxiaMin = oxygen < RULES.hypoxia ? prev.hypoxiaMin + dtMin : 0;
  let fasting = prev.fasting;
  if (oxygen >= RULES.feedResume) fasting = false;
  else if (hypoxiaMin >= RULES.sustainedMin) fasting = true;
  // —— 每尾鱼的应激、饱食与生长 ——
  const fish = prev.fish.map((f) => {
    let ds = 0;
    if (oxygen < RULES.critical) ds += 16;
    else if (oxygen < RULES.hypoxia) ds += 8;
    if (fasting) ds += 5;
    if (crowded) ds += 8;
    if (DIET[f.fish].shelter && !sheltered.has(f.id)) ds += 12;
    if (f.satiety < RULES.hungryAt) ds += 4;
    if (ds === 0 && oxygen >= 5) ds = -12;
    const stress = clamp(f.stress + ds * dtH, 0, 100);
    const feeding =
      oxygen >= RULES.hypoxia && !fasting && f.stress < RULES.stressUnhealthy;
    const satiety = clamp(
      f.satiety + (feeding ? RULES.satietyFeed : -RULES.satietyDrop) * dtH,
      0,
      100,
    );
    const maxW = species(f.fish).max;
    const weight = feeding
      ? Math.min(maxW, f.weight * (1 + RULES.growthPerHour * dtH))
      : f.weight;
    return { ...f, stress, satiety, weight };
  });
  const next: SimState = { ...prev, oxygen, hypoxiaMin, fasting, fish };
  if (out) collectEvents(prev, next, tMs, out);
  return next;
}

function collectEvents(
  prev: SimState,
  next: SimState,
  tMs: number,
  out: TankEvent[],
) {
  if (prev.oxygen >= RULES.hypoxia && next.oxygen < RULES.hypoxia)
    out.push({
      t: tMs,
      kind: "o2-low",
      text: `溶氧跌破 ${RULES.hypoxia} mg/L，进入缺氧`,
    });
  if (prev.oxygen >= RULES.critical && next.oxygen < RULES.critical)
    out.push({
      t: tMs,
      kind: "o2-critical",
      text: `溶氧跌破 ${RULES.critical} mg/L，危急缺氧`,
    });
  if (prev.oxygen < RULES.hypoxia && next.oxygen >= RULES.hypoxia)
    out.push({
      t: tMs,
      kind: "o2-back",
      text: `溶氧回升至 ${RULES.hypoxia} mg/L 以上`,
    });
  if (!prev.fasting && next.fasting)
    out.push({
      t: tMs,
      kind: "fasting",
      text: `持续缺氧满 ${RULES.sustainedMin} 分钟，鱼群停止进食、耗氧下降`,
    });
  if (prev.fasting && !next.fasting)
    out.push({ t: tMs, kind: "feeding", text: "溶氧恢复，鱼群重新开始进食" });
  const before = new Map(prev.fish.map((f) => [f.id, f.stress]));
  for (const f of next.fish) {
    const was = before.get(f.id) ?? 0;
    if (was < RULES.stressUnhealthy && f.stress >= RULES.stressUnhealthy)
      out.push({
        t: tMs,
        kind: "stress",
        text: `${species(f.fish).name} 应激超过 ${RULES.stressUnhealthy}`,
      });
  }
}

/**
 * 从 startMs 起按固定步长模拟 minutes 分钟。
 * onStep 返回 false 可提前终止（用于求解器快速判定）。
 */
export function simulate(
  init: SimState,
  startMs: number,
  minutes: number,
  onStep?: (s: SimState, tMs: number) => void | false,
  events?: TankEvent[],
): SimState {
  let s = init;
  const step = RULES.stepMin;
  for (let m = 0; m < minutes; m += step) {
    const t = startMs + (m + step) * 60000;
    s = stepSim(s, t, step, events);
    if (onStep && onStep(s, t) === false) break;
  }
  return s;
}

export interface EvalSummary {
  healthy: boolean; // 全程每一步都健康（不是终点或平均合格）
  minOxygen: number;
  minOxygenAt: number;
  firstBreachAt: number | null;
  breach: string | null;
  dangerEnd: number | null; // 首次不健康时段的结束时刻，null 表示持续到窗口末尾
  events: TankEvent[];
}

/** 评估未来 minutes 分钟：逐分钟检查整箱健康，记录最危险时段与阈值事件顺序。 */
export function evaluate(
  init: SimState,
  startMs: number,
  minutes: number,
): EvalSummary {
  const events: TankEvent[] = [];
  let minOxygen = init.oxygen;
  let minOxygenAt = startMs;
  let firstBreachAt: number | null = null;
  let breach: string | null = null;
  let dangerEnd: number | null = null;
  const initialBreach = breachReason(init);
  if (initialBreach) {
    firstBreachAt = startMs;
    breach = initialBreach;
  }
  simulate(
    init,
    startMs,
    minutes,
    (s, t) => {
      if (s.oxygen < minOxygen) {
        minOxygen = s.oxygen;
        minOxygenAt = t;
      }
      const reason = breachReason(s);
      if (reason) {
        if (firstBreachAt === null) {
          firstBreachAt = t;
          breach = reason;
        }
        dangerEnd = null;
      } else if (firstBreachAt !== null && dangerEnd === null) {
        dangerEnd = t;
      }
    },
    events,
  );
  return {
    healthy: firstBreachAt === null,
    minOxygen,
    minOxygenAt,
    firstBreachAt,
    breach,
    dangerEnd,
    events,
  };
}
