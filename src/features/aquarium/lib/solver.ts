import type { FacilityKind, GameDocument, Tank } from "../../../shared/types";
import { DIET, FACILITIES, RULES, fishSpace } from "../model/rules";
import {
  breachReason,
  evaluate,
  simFromTank,
  simulate,
  spaceUsed,
  type EvalSummary,
  type SimState,
} from "./simulate";

export interface RepairPlan {
  removeFish: string[]; // 移回背包的鱼（catchId）
  addFacilities: FacilityKind[]; // 增设的设施
  removeFacilities: string[]; // 移除的设施（facility id）
}
export interface SolveResult {
  // ok：找到可行方案（含「无需改动」）；infeasible：已穷举全部组合确认无解；
  // unfinished：组合空间过大尚未算完，不据此宣称无解。
  status: "ok" | "infeasible" | "unfinished";
  plan: RepairPlan;
  evaluated: number; // 实际评估的候选数
  baseline: EvalSummary; // 不做任何改动时未来 6 小时的走向
  after: EvalSummary | null; // 采用方案后的走向
}

interface Counts {
  plant: number;
  airstone: number;
  shelter: number;
}

/** 评估上限：防止极端情况下长时间计算；触顶时返回 unfinished 而非无解。 */
const EVAL_CAP = 400000;

function countKinds(tank: Tank, pinnedOnly: boolean): Counts {
  const c: Counts = { plant: 0, airstone: 0, shelter: 0 };
  for (const f of tank.facilities)
    if (!pinnedOnly || f.pinned) c[f.kind] += 1;
  return c;
}

function candidateState(
  base: SimState,
  removed: Set<string>,
  counts: Counts,
): SimState {
  return {
    ...base,
    plants: counts.plant,
    airstones: counts.airstone,
    shelters: counts.shelter,
    fish: base.fish.filter((f) => !removed.has(f.id)),
  };
}

function healthyThroughout(
  init: SimState,
  startMs: number,
  minutes: number,
): boolean {
  if (breachReason(init)) return false;
  let ok = true;
  simulate(init, startMs, minutes, (s) => {
    if (breachReason(s)) {
      ok = false;
      return false; // 首次不健康即终止，节省时间
    }
    return undefined;
  });
  return ok;
}

/** 枚举目标设施数量组合：不减少锁定设施，新增花费不超预算，按改动数升序。 */
function facilityOptions(cur: Counts, pinned: Counts) {
  const opts: { counts: Counts; changes: number; cost: number }[] = [];
  const maxAdd = (cost: number) => Math.floor(RULES.repairBudget / cost);
  for (
    let p = pinned.plant;
    p <= cur.plant + maxAdd(FACILITIES.plant.cost);
    p++
  )
    for (
      let a = pinned.airstone;
      a <= cur.airstone + maxAdd(FACILITIES.airstone.cost);
      a++
    )
      for (
        let s = pinned.shelter;
        s <= cur.shelter + maxAdd(FACILITIES.shelter.cost);
        s++
      ) {
        const cost =
          Math.max(0, p - cur.plant) * FACILITIES.plant.cost +
          Math.max(0, a - cur.airstone) * FACILITIES.airstone.cost +
          Math.max(0, s - cur.shelter) * FACILITIES.shelter.cost;
        if (cost > RULES.repairBudget) continue;
        const changes =
          Math.abs(p - cur.plant) +
          Math.abs(a - cur.airstone) +
          Math.abs(s - cur.shelter);
        opts.push({ counts: { plant: p, airstone: a, shelter: s }, changes, cost });
      }
  return opts.sort((x, y) => x.changes - y.changes || x.cost - y.cost);
}

function* combos<T>(items: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  if (k > items.length) return;
  const pick = (start: number, acc: T[]): Generator<T[]> =>
    (function* () {
      if (acc.length === k) {
        yield acc;
        return;
      }
      for (let i = start; i <= items.length - (k - acc.length); i++)
        yield* pick(i + 1, [...acc, items[i]]);
    })();
  yield* pick(0, []);
}

function buildPlan(
  removedFish: string[],
  cur: Counts,
  final: Counts,
  tank: Tank,
): RepairPlan {
  const addFacilities: FacilityKind[] = [];
  const removeFacilities: string[] = [];
  (Object.keys(cur) as FacilityKind[]).forEach((kind) => {
    const diff = final[kind] - cur[kind];
    if (diff > 0) for (let i = 0; i < diff; i++) addFacilities.push(kind);
    else if (diff < 0) {
      const removable = tank.facilities
        .filter((f) => f.kind === kind && !f.pinned)
        .map((f) => f.id);
      removeFacilities.push(...removable.slice(0, -diff));
    }
  });
  return { removeFish: removedFish, addFacilities, removeFacilities };
}

/**
 * 在有限空间、设施预算与锁定约束下，求未来六小时全程维持整箱健康的修复方案。
 * 优先级：最少移走鱼，其次最少移动或增加设施。
 * 搜索对「鱼移除组合 × 设施数量组合」是穷举的；只有全部评估完才返回无解。
 */
export function solveRepair(doc: GameDocument, now: number): SolveResult {
  const minutes = RULES.guaranteeHours * 60;
  const tank = doc.tank;
  const base = simFromTank(tank, doc.bag);
  const baseline = evaluate(base, now, minutes);
  const empty: RepairPlan = {
    removeFish: [],
    addFacilities: [],
    removeFacilities: [],
  };
  if (baseline.healthy)
    return { status: "ok", plan: empty, evaluated: 1, baseline, after: baseline };

  const cur = countKinds(tank, false);
  const pinned = countKinds(tank, true);
  const options = facilityOptions(cur, pinned);
  // 按负载从大到小排序，让最有希望的组合先被评估
  const load = new Map(
    base.fish.map((f) => [
      f.id,
      fishSpace(f.weight) + 10 * (0.05 + 0.09 * f.weight) * DIET[f.fish].factor,
    ]),
  );
  const removable = tank.fish
    .filter((f) => !f.pinned)
    .map((f) => f.catchId)
    .sort((a, b) => (load.get(b) ?? 0) - (load.get(a) ?? 0));

  let evaluated = 1;
  let best: { plan: RepairPlan; counts: Counts; changes: number } | null = null;
  for (let k = 0; k <= removable.length && !best; k++) {
    for (const combo of combos(removable, k)) {
      const removed = new Set(combo);
      for (const opt of options) {
        if (best && opt.changes >= best.changes) continue;
        if (evaluated >= EVAL_CAP)
          return {
            status: "unfinished",
            plan: empty,
            evaluated,
            baseline,
            after: null,
          };
        const cand = candidateState(base, removed, opt.counts);
        evaluated++;
        if (spaceUsed(cand) > RULES.capacity) continue;
        if (!healthyThroughout(cand, now, minutes)) continue;
        best = {
          plan: buildPlan(combo, cur, opt.counts, tank),
          counts: opt.counts,
          changes: opt.changes,
        };
        break; // 设施选项按改动数升序，首个可行即该组合下最优
      }
    }
  }
  if (!best) return { status: "infeasible", plan: empty, evaluated, baseline, after: null };
  const after = evaluate(
    candidateState(base, new Set(best.plan.removeFish), best.counts),
    now,
    minutes,
  );
  return { status: "ok", plan: best.plan, evaluated, baseline, after };
}
