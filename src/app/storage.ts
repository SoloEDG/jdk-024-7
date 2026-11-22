import { newDocument } from "../shared/initial";
import { fishCatalog } from "../shared/catalog";
import type { GameDocument, TankEvent } from "../shared/types";
import { advanceTank, normalizeTank } from "../features/aquarium";
const key = "stillwater-jdk024-v1";
function valid(value: unknown): value is GameDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as GameDocument;
  const fishIds = fishCatalog.map((f) => f.id);
  const spots = ["reed", "brook", "deep"];
  const baits = ["worm", "corn", "fly"];
  return (
    d.version === 1 &&
    spots.includes(d.spot) &&
    baits.includes(d.bait) &&
    Number.isFinite(d.power) &&
    d.power >= 0.15 &&
    d.power <= 0.95 &&
    Number.isFinite(d.drag) &&
    d.drag >= 0.15 &&
    d.drag <= 0.95 &&
    Number.isInteger(d.seed) &&
    !!d.stock &&
    baits.every(
      (b) =>
        Number.isInteger(d.stock[b as keyof typeof d.stock]) &&
        d.stock[b as keyof typeof d.stock] >= 0,
    ) &&
    !!d.stats &&
    ["casts", "catches", "escapes", "released"].every(
      (k) =>
        Number.isInteger(d.stats[k as keyof typeof d.stats]) &&
        d.stats[k as keyof typeof d.stats] >= 0,
    ) &&
    Array.isArray(d.claimed) &&
    d.claimed.every((c) => typeof c === "string") &&
    Array.isArray(d.bag) &&
    d.bag.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        fishIds.includes(c.fish) &&
        spots.includes(c.spot) &&
        baits.includes(c.bait) &&
        [c.weight, c.time, c.duration, c.peakTension].every(Number.isFinite),
    ) &&
    !!d.journal &&
    Object.entries(d.journal).every(
      ([id, e]) =>
        fishIds.includes(id as (typeof fishIds)[number]) &&
        e &&
        Number.isInteger(e.count) &&
        e.count > 0 &&
        Number.isFinite(e.best) &&
        Number.isFinite(e.first),
    )
  );
}
export interface LoadedGame {
  doc: GameDocument;
  notice: string;
  recovery?: true;
  tankReport: TankEvent[] | null;
}
function withTank(doc: GameDocument, now: number): LoadedGame {
  const normalized: GameDocument = {
    ...doc,
    tank: normalizeTank(doc.tank, doc.bag, now),
  };
  // 离线补算（最多六小时），期间阈值变化按顺序收集，返回时展示
  const report: TankEvent[] = [];
  const advanced = advanceTank(normalized, now, report);
  return {
    doc: advanced,
    notice: "",
    tankReport: report.length > 0 ? report : null,
  };
}
export function loadGame(): LoadedGame {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { doc: newDocument(), notice: "", tankReport: null };
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed)
      ? withTank(parsed, now)
      : {
          doc: newDocument(),
          notice: "本地手记格式或版本无法读取，已保留原手记并开启临时游玩。",
          recovery: true,
          tankReport: null,
        };
  } catch {
    return {
      doc: newDocument(),
      notice: "无法读取本地手记，已暂停自动保存，本次可以临时游玩。",
      recovery: true,
      tankReport: null,
    };
  }
}
export function saveGame(doc: GameDocument) {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
