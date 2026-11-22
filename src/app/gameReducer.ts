import type { Workspace } from "../shared/types";
import type { Command } from "../shared/commands";
import { idleSession, isBusy } from "../shared/initial";
import { selectWater } from "../features/waters";
import {
  chooseBait,
  tune,
  consumeBait,
  resupply,
  attraction,
  biteDelay,
} from "../features/tackle";
import { prepareCast, tickSession, strike } from "../features/fishing";
import { landCatch, releaseCatch } from "../features/collection";
import { claimReward } from "../features/challenges";
import {
  addFacility,
  addFishToTank,
  advanceTank,
  applyPlan,
  removeFacility,
  removeFishFromTank,
  toggleFacilityPin,
  toggleFishPin,
} from "../features/aquarium";
export function gameReducer(state: Workspace, c: Command): Workspace {
  const { doc, session: s } = state;
  const busy = isBusy(s);
  switch (c.type) {
    case "spot":
      return busy ? state : { ...state, doc: selectWater(doc, c.id) };
    case "bait":
      return busy ? state : { ...state, doc: chooseBait(doc, c.id) };
    case "power":
      return { ...state, doc: tune(doc, "power", c.value) };
    case "drag":
      return busy ? state : { ...state, doc: tune(doc, "drag", c.value) };
    case "resupply":
      return busy
        ? state
        : {
            ...state,
            doc: resupply(doc),
            notice: "鱼饵已补给，带上好心情出发。",
          };
    case "charge-start":
      return s.phase === "ready" && doc.stock[doc.bait] > 0
        ? {
            ...state,
            session: {
              ...idleSession(),
              phase: "charging",
              message: "再次点击，把鱼饵抛向水面。",
            },
          }
        : state;
    case "cast": {
      if (s.phase !== "charging") return state;
      const consumed = consumeBait(doc);
      if (!consumed) return state;
      const cast = prepareCast(
        doc,
        s.charge,
        attraction(doc.spot, doc.bait),
        (r) => biteDelay(doc.bait, r),
      );
      return {
        ...state,
        doc: {
          ...consumed,
          seed: cast.seed,
          stats: { ...doc.stats, casts: doc.stats.casts + 1 },
        },
        session: cast.session,
      };
    }
    case "strike":
      return { ...state, session: strike(s) };
    case "reel":
      return s.phase === "fighting"
        ? { ...state, session: { ...s, reeling: c.held } }
        : state;
    case "tick": {
      const next = tickSession(s, doc, Math.min(0.1, Math.max(0, c.dt)));
      let updated = doc;
      if (next.phase === "landed" && s.phase !== "landed")
        updated = landCatch(doc, next, Date.now());
      if (next.phase === "escaped" && s.phase !== "escaped")
        updated = {
          ...doc,
          stats: { ...doc.stats, escapes: doc.stats.escapes + 1 },
        };
      const advanced = advanceTank(updated, Date.now());
      if (next === s && advanced === updated) return state;
      return { ...state, doc: advanced, session: next };
    }
    case "next":
      return s.phase === "landed" || s.phase === "escaped"
        ? { ...state, session: idleSession() }
        : state;
    case "release": {
      const released = releaseCatch(doc, c.id);
      if (released === doc) return state;
      const tank = released.tank;
      const inTank = tank.fish.some((f) => f.catchId === c.id);
      const condition = { ...tank.condition };
      delete condition[c.id];
      return {
        ...state,
        doc: inTank
          ? {
              ...released,
              tank: {
                ...tank,
                fish: tank.fish.filter((f) => f.catchId !== c.id),
                condition,
                guaranteeUntil: null,
              },
            }
          : released,
      };
    }
    case "claim":
      return { ...state, doc: claimReward(doc, c.id) };
    case "tank-add-fish": {
      const advanced = advanceTank(doc, Date.now());
      const next = addFishToTank(advanced, c.id);
      return next === advanced
        ? state
        : { ...state, doc: next, notice: "已安置到水箱。" };
    }
    case "tank-remove-fish": {
      const advanced = advanceTank(doc, Date.now());
      const next = removeFishFromTank(advanced, c.id);
      return next === advanced
        ? state
        : { ...state, doc: next, notice: "已移回背包。" };
    }
    case "tank-add-facility": {
      const advanced = advanceTank(doc, Date.now());
      const next = addFacility(advanced, c.kind, Date.now());
      return next === advanced
        ? state
        : { ...state, doc: next, notice: "设施已布置好。" };
    }
    case "tank-remove-facility": {
      const advanced = advanceTank(doc, Date.now());
      const next = removeFacility(advanced, c.id);
      return next === advanced
        ? state
        : { ...state, doc: next, notice: "设施已移除。" };
    }
    case "tank-pin-fish": {
      const next = toggleFishPin(doc, c.id);
      return next === doc ? state : { ...state, doc: next };
    }
    case "tank-pin-facility": {
      const next = toggleFacilityPin(doc, c.id);
      return next === doc ? state : { ...state, doc: next };
    }
    case "tank-apply-plan": {
      const now = Date.now();
      const { doc: next, guaranteed } = applyPlan(
        advanceTank(doc, now),
        c.plan,
        now,
      );
      return {
        ...state,
        doc: next,
        notice: guaranteed
          ? "修复方案已生效，未来 6 小时的整箱健康获得保障。"
          : "水箱状态已变化，方案未能通过复核，请重新计算。",
      };
    }
    case "tank-dismiss-report":
      return { ...state, tankReport: null };
  }
}
