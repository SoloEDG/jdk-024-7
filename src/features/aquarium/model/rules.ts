import type { FacilityKind, FishId } from "../../../shared/types";

/** 水箱生态的全部规则与阈值，界面中的「规则与阈值」面板即由这些常量生成。 */
export const RULES = {
  capacity: 60, // 水箱容积（升），鱼与设施共同占用
  oxygenMax: 9, // 溶氧上限 mg/L（饱和）
  oxygenStart: 6.8, // 新水箱初始溶氧 mg/L
  hypoxia: 4.0, // 缺氧阈值 mg/L，低于即不健康
  critical: 2.5, // 危急缺氧阈值 mg/L
  feedResume: 4.5, // 溶氧回升到此值以上才恢复进食
  sustainedMin: 60, // 连续低于缺氧阈值多少分钟判定为「持续缺氧」
  stressWarn: 40, // 应激警戒值（耗氧上升）
  stressUnhealthy: 70, // 应激不健康阈值
  crowdRatio: 0.9, // 空间占用超过该比例视为拥挤
  reaeration: 0.15, // 水面自然复氧 mg/L/h
  repairBudget: 6, // 单次修复方案的设施预算（点）
  guaranteeHours: 6, // 修复方案保障时长（小时）
  offlineCapHours: 6, // 离线补算时长上限（小时）
  stepMin: 1, // 生态模拟步长（分钟）
  dayStart: 6, // 白天开始（时）
  dayEnd: 18, // 白天结束（时）
  growthPerHour: 0.002, // 进食中鱼的体重增速（每小时比例）
  satietyFeed: 18, // 进食时饱食度恢复 /h
  satietyDrop: 5, // 未进食时饱食度下降 /h
  hungryAt: 30, // 饥饿阈值（低于则耗氧下降、应激上升）
} as const;

export interface FacilityDef {
  kind: FacilityKind;
  name: string;
  cost: number; // 修复预算点数
  space: number; // 占用容积（升）
  dayO2: number; // 白天产氧 mg/L/h（负值为耗氧）
  nightO2: number; // 夜间产氧 mg/L/h（负值为耗氧）
  desc: string;
}
export const FACILITIES: Record<FacilityKind, FacilityDef> = {
  plant: {
    kind: "plant",
    name: "水草",
    cost: 2,
    space: 3,
    dayO2: 0.3,
    nightO2: -0.08,
    desc: "白天光合作用产氧，夜间呼吸作用耗氧。",
  },
  airstone: {
    kind: "airstone",
    name: "增氧石",
    cost: 3,
    space: 2,
    dayO2: 0.45,
    nightO2: 0.45,
    desc: "昼夜持续增氧，不随昼夜变化。",
  },
  shelter: {
    kind: "shelter",
    name: "掩体",
    cost: 2,
    space: 5,
    dayO2: 0,
    nightO2: 0,
    desc: "为掠食鱼提供领地，每处掩体只容一尾掠食鱼。",
  },
};
export const FACILITY_KINDS: FacilityKind[] = ["plant", "airstone", "shelter"];

export interface DietDef {
  kind: "杂食" | "肉食" | "掠食";
  factor: number; // 耗氧系数
  shelter: boolean; // 是否需要掩体领地
}
export const DIET: Record<FishId, DietDef> = {
  crucian: { kind: "杂食", factor: 1.0, shelter: false },
  carp: { kind: "杂食", factor: 1.0, shelter: false },
  perch: { kind: "肉食", factor: 1.2, shelter: false },
  trout: { kind: "肉食", factor: 1.2, shelter: false },
  bass: { kind: "掠食", factor: 1.35, shelter: true },
  pike: { kind: "掠食", factor: 1.35, shelter: true },
};

/** 单尾鱼占用的水箱容积（升），随体重增长。 */
export function fishSpace(weight: number) {
  return 3 + 2.5 * weight;
}
/** 单尾鱼每小时耗氧 mg/L，受体形、食性、进食抑制与应激影响。 */
export function fishConsumption(
  weight: number,
  fish: FishId,
  state: { fasting: boolean; satiety: number; stress: number },
) {
  const feed = state.fasting
    ? 0.6 // 持续缺氧抑制进食，代谢与耗氧随之下降
    : state.satiety < RULES.hungryAt
      ? 0.85
      : 1;
  const stress = state.stress >= RULES.stressWarn ? 1.15 : 1;
  return (0.05 + 0.09 * weight) * DIET[fish].factor * feed * stress;
}
