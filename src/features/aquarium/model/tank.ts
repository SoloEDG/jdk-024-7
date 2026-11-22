import type {
  Catch,
  Facility,
  Tank,
  TankEvent,
  TankFish,
} from "../../../shared/types";
import { emptyTank } from "../../../shared/initial";
import { clamp } from "../../../shared/random";
import { RULES } from "./rules";

const KINDS = ["plant", "airstone", "shelter"];

/** 把存档中的水箱字段规范化为合法状态；缺失或损坏时回退为默认水箱。 */
export function normalizeTank(raw: unknown, bag: Catch[], now: number): Tank {
  if (!raw || typeof raw !== "object") return emptyTank(now);
  const t = raw as Partial<Tank>;
  const bagIds = new Set(bag.map((c) => c.id));
  const fish: TankFish[] = Array.isArray(t.fish)
    ? t.fish.filter(
        (f): f is TankFish =>
          !!f &&
          typeof f.catchId === "string" &&
          bagIds.has(f.catchId) &&
          typeof f.pinned === "boolean",
      )
    : [];
  const facilities: Facility[] = Array.isArray(t.facilities)
    ? t.facilities.filter(
        (f): f is Facility =>
          !!f &&
          typeof f.id === "string" &&
          KINDS.includes(f.kind) &&
          typeof f.pinned === "boolean",
      )
    : [];
  const condition: Tank["condition"] = {};
  for (const f of fish) {
    const c = t.condition?.[f.catchId];
    condition[f.catchId] =
      c && Number.isFinite(c.stress) && Number.isFinite(c.satiety)
        ? {
            stress: clamp(c.stress, 0, 100),
            satiety: clamp(c.satiety, 0, 100),
          }
        : { stress: 0, satiety: 80 };
  }
  const events: TankEvent[] = Array.isArray(t.events)
    ? t.events
        .filter(
          (e): e is TankEvent =>
            !!e &&
            Number.isFinite(e.t) &&
            typeof e.kind === "string" &&
            typeof e.text === "string",
        )
        .slice(-40)
    : [];
  const lastTick =
    Number.isFinite(t.lastTick) && t.lastTick! > 0 && t.lastTick! <= now
      ? t.lastTick!
      : now;
  return {
    fish,
    facilities,
    condition,
    events,
    oxygen: Number.isFinite(t.oxygen)
      ? clamp(t.oxygen!, 0, RULES.oxygenMax)
      : RULES.oxygenStart,
    hypoxiaMin: Number.isFinite(t.hypoxiaMin) ? Math.max(0, t.hypoxiaMin!) : 0,
    fasting: t.fasting === true,
    lastTick,
    healthStreakH: Number.isFinite(t.healthStreakH)
      ? Math.max(0, t.healthStreakH!)
      : 0,
    bestStreakH: Number.isFinite(t.bestStreakH)
      ? Math.max(0, t.bestStreakH!)
      : 0,
    guaranteeUntil:
      Number.isFinite(t.guaranteeUntil) && t.guaranteeUntil! > now
        ? t.guaranteeUntil!
        : null,
  };
}
