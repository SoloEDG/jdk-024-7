import { useState } from "react";
import {
  Backpack,
  BookOpen,
  Droplets,
  Leaf,
  Moon,
  Pin,
  PinOff,
  Plus,
  ShieldCheck,
  Sun,
  Tent,
  Waves,
  Wrench,
} from "lucide-react";
import type { FacilityKind, GameDocument, TankEvent } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { species } from "../../../shared/catalog";
import { FishIllustration } from "../../collection";
import {
  DIET,
  FACILITIES,
  FACILITY_KINDS,
  RULES,
  fishSpace,
} from "../model/rules";
import {
  isDay,
  localHour,
  shelteredIds,
  simFromTank,
  spaceUsed,
  tankHealthy,
} from "../lib/simulate";
import { fmtClock, fmtHours } from "../lib/format";
import { RulesDialog } from "./RulesDialog";
import { RepairDialog } from "./RepairDialog";

const FACILITY_ICON: Record<FacilityKind, typeof Leaf> = {
  plant: Leaf,
  airstone: Droplets,
  shelter: Tent,
};

function oxygenClass(oxygen: number) {
  if (oxygen < RULES.critical) return "bad";
  if (oxygen < RULES.hypoxia) return "warn";
  return "good";
}

export function AquariumPanel({
  doc,
  send,
  report,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
  report: TankEvent[] | null;
}) {
  const tank = doc.tank;
  const [showRules, setShowRules] = useState(false);
  const [showRepair, setShowRepair] = useState(false);
  const sim = simFromTank(tank, doc.bag);
  const space = spaceUsed(sim);
  const crowded = space > RULES.capacity * RULES.crowdRatio;
  const sheltered = shelteredIds(sim);
  const now = Date.now();
  const day = isDay(localHour(now));
  const healthy = tankHealthy(sim);
  const guaranteed = tank.guaranteeUntil !== null && tank.guaranteeUntil > now;
  const inTank = new Set(tank.fish.map((f) => f.catchId));
  const bagFish = doc.bag.filter((c) => !inTank.has(c.id));
  const freeSpace = RULES.capacity - space;
  return (
    <section className="aquarium-panel">
      <div className="section-title">
        <Waves size={17} />
        <h2>互动水箱</h2>
        <span className={healthy ? "tank-health ok" : "tank-health bad"}>
          {healthy ? "整箱健康" : "整箱不健康"}
        </span>
        <button className="text-btn" onClick={() => setShowRules(true)}>
          <BookOpen size={13} />
          规则与阈值
        </button>
        <button className="text-btn" onClick={() => setShowRepair(true)}>
          <Wrench size={13} />
          求修复方案
        </button>
      </div>

      <div className="tank-status-row">
        <div className={`tank-stat o2-${oxygenClass(tank.oxygen)}`}>
          <small>溶氧</small>
          <strong>{tank.oxygen.toFixed(1)} mg/L</strong>
          <meter
            min={0}
            max={RULES.oxygenMax}
            low={RULES.hypoxia}
            optimum={RULES.oxygenMax}
            value={tank.oxygen}
          />
          <small>
            {tank.fasting
              ? "持续缺氧 · 停食中"
              : tank.oxygen < RULES.hypoxia
                ? "缺氧中"
                : `≥ ${RULES.hypoxia} 为健康`}
          </small>
        </div>
        <div className="tank-stat">
          <small>昼夜</small>
          <strong>
            {day ? <Sun size={15} /> : <Moon size={15} />}
            {day ? "白天" : "夜间"} {fmtClock(now)}
          </strong>
          <small>
            {day ? "水草光合产氧中" : "水草转为耗氧，留意夜间缺氧"}
          </small>
        </div>
        <div className={`tank-stat ${crowded ? "o2-warn" : ""}`}>
          <small>空间</small>
          <strong>
            {space.toFixed(1)} / {RULES.capacity} L
          </strong>
          <meter max={RULES.capacity} value={space} />
          <small>{crowded ? "拥挤，应激上升" : `剩余 ${freeSpace.toFixed(1)} L`}</small>
        </div>
        <div className="tank-stat">
          <small>连续健康</small>
          <strong>{fmtHours(tank.healthStreakH)}</strong>
          <small>最佳 {fmtHours(tank.bestStreakH)}</small>
        </div>
        <div className={`tank-stat ${guaranteed ? "o2-good" : ""}`}>
          <small>健康保障</small>
          <strong>
            <ShieldCheck size={15} />
            {guaranteed ? `至 ${fmtClock(tank.guaranteeUntil!)}` : "无"}
          </strong>
          <small>{guaranteed ? "编辑水箱将立即失效" : "确认修复方案后开启"}</small>
        </div>
      </div>

      <div className="tank-scene" aria-hidden="true">
        {sim.fish.slice(0, 6).map((f, i) => (
          <span
            key={f.id}
            className="tank-swimmer"
            style={{ left: `${8 + i * 15}%`, animationDelay: `${i * -2.3}s` }}
          >
            <FishIllustration fish={species(f.fish)} />
          </span>
        ))}
        <div className="tank-floor">
          {tank.facilities.map((f) => {
            const Icon = FACILITY_ICON[f.kind];
            return (
              <span key={f.id} className={`tank-deco deco-${f.kind}`}>
                <Icon size={f.kind === "plant" ? 22 : 18} />
              </span>
            );
          })}
        </div>
      </div>

      <div className="tank-columns">
        <div className="tank-col">
          <h3>
            箱中鱼 <b>{tank.fish.length}</b>
          </h3>
          {tank.fish.length === 0 && (
            <p className="tank-empty">还没有居民，从背包安置一尾吧。</p>
          )}
          {tank.fish.map((tf) => {
            const c = doc.bag.find((x) => x.id === tf.catchId);
            if (!c) return null;
            const sp = species(c.fish);
            const diet = DIET[c.fish];
            const cond = tank.condition[tf.catchId] ?? {
              stress: 0,
              satiety: 80,
            };
            const needsShelter = diet.shelter;
            const hasShelter = sheltered.has(tf.catchId);
            return (
              <div className="tank-fish" key={tf.catchId}>
                <FishIllustration fish={sp} />
                <div className="tank-fish-info">
                  <strong>
                    {sp.name}
                    <em>{c.weight.toFixed(2)} kg</em>
                  </strong>
                  <small>
                    {diet.kind} · 耗氧 ×{diet.factor}
                    {needsShelter &&
                      (hasShelter ? " · 有掩体" : " · 缺掩体！")}
                  </small>
                  <span className="tank-bars">
                    <label>应激 {Math.round(cond.stress)}</label>
                    <meter
                      min={0}
                      max={100}
                      low={RULES.stressWarn}
                      high={RULES.stressUnhealthy}
                      optimum={0}
                      value={cond.stress}
                    />
                    <label>饱食 {Math.round(cond.satiety)}</label>
                    <meter min={0} max={100} value={cond.satiety} />
                  </span>
                </div>
                <div className="tank-fish-actions">
                  <button
                    className="icon-btn"
                    title={tf.pinned ? "解除锁定" : "锁定（修复方案不动它）"}
                    onClick={() =>
                      send({ type: "tank-pin-fish", id: tf.catchId })
                    }
                  >
                    {tf.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button
                    className="text-btn"
                    disabled={tf.pinned}
                    title={tf.pinned ? "先解除锁定" : "移回背包"}
                    onClick={() =>
                      send({ type: "tank-remove-fish", id: tf.catchId })
                    }
                  >
                    移回
                  </button>
                  <button
                    className="text-btn"
                    disabled={tf.pinned}
                    title={tf.pinned ? "先解除锁定" : "放流（保留图鉴记录）"}
                    onClick={() => send({ type: "release", id: tf.catchId })}
                  >
                    放流
                  </button>
                </div>
              </div>
            );
          })}
          <h3>
            背包待安置 <b>{bagFish.length}</b>
          </h3>
          {bagFish.length === 0 && (
            <p className="tank-empty">背包里没有可安置的鱼。</p>
          )}
          {bagFish.map((c) => {
            const sp = species(c.fish);
            const fits = fishSpace(c.weight) <= freeSpace;
            return (
              <div className="tank-fish bag" key={c.id}>
                <FishIllustration fish={sp} />
                <div className="tank-fish-info">
                  <strong>
                    {sp.name}
                    <em>{c.weight.toFixed(2)} kg</em>
                  </strong>
                  <small>
                    {DIET[c.fish].kind} · 占 {fishSpace(c.weight).toFixed(1)} L
                  </small>
                </div>
                <div className="tank-fish-actions">
                  <button
                    className="text-btn"
                    disabled={!fits}
                    title={fits ? "安置到水箱" : "空间不足"}
                    onClick={() => send({ type: "tank-add-fish", id: c.id })}
                  >
                    安置
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="tank-col">
          <h3>
            设施 <b>{tank.facilities.length}</b>
          </h3>
          {tank.facilities.length === 0 && (
            <p className="tank-empty">还没有设施，先布置一些吧。</p>
          )}
          {tank.facilities.map((f) => {
            const Icon = FACILITY_ICON[f.kind];
            const def = FACILITIES[f.kind];
            return (
              <div className="tank-facility" key={f.id}>
                <Icon size={16} />
                <div className="tank-fish-info">
                  <strong>{def.name}</strong>
                  <small>
                    {def.space} L ·{" "}
                    {f.kind === "shelter"
                      ? "一尾掠食鱼的领地"
                      : `产氧 ${def.dayO2 > 0 ? `+${def.dayO2}` : def.dayO2}/${def.nightO2 > 0 ? `+${def.nightO2}` : def.nightO2}（昼/夜）`}
                  </small>
                </div>
                <div className="tank-fish-actions">
                  <button
                    className="icon-btn"
                    title={f.pinned ? "解除锁定" : "锁定（修复方案不动它）"}
                    onClick={() =>
                      send({ type: "tank-pin-facility", id: f.id })
                    }
                  >
                    {f.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button
                    className="text-btn"
                    disabled={f.pinned}
                    title={f.pinned ? "先解除锁定" : "移除该设施"}
                    onClick={() =>
                      send({ type: "tank-remove-facility", id: f.id })
                    }
                  >
                    移除
                  </button>
                </div>
              </div>
            );
          })}
          <div className="facility-add-row">
            {FACILITY_KINDS.map((kind) => {
              const def = FACILITIES[kind];
              const Icon = FACILITY_ICON[kind];
              const fits = def.space <= freeSpace;
              return (
                <button
                  key={kind}
                  className="facility-add"
                  disabled={!fits}
                  title={
                    fits
                      ? `${def.desc}（占 ${def.space} L）`
                      : "空间不足"
                  }
                  onClick={() => send({ type: "tank-add-facility", kind })}
                >
                  <Plus size={13} />
                  <Icon size={14} />
                  {def.name}
                </button>
              );
            })}
          </div>
          <h3>
            水箱日志 <b>{tank.events.length}</b>
          </h3>
          {tank.events.length === 0 && (
            <p className="tank-empty">暂无阈值变化记录。</p>
          )}
          <ol className="tank-log">
            {tank.events
              .slice(-6)
              .reverse()
              .map((e, i) => (
                <li key={`${e.t}-${i}`} className={`log-${e.kind}`}>
                  <time>{fmtClock(e.t)}</time>
                  {e.text}
                </li>
              ))}
          </ol>
          <p className="tank-note">
            <Backpack size={12} />
            移回背包或放流都保持数量守恒，图鉴记录不受影响。
          </p>
        </div>
      </div>

      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      {showRepair && (
        <RepairDialog
          doc={doc}
          send={send}
          onClose={() => setShowRepair(false)}
        />
      )}
      {report && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tank-report-title"
            className="guide tank-report"
          >
            <span className="eyebrow">WHILE YOU WERE AWAY</span>
            <h2 id="tank-report-title">离开期间的水箱变化</h2>
            <p className="muted">
              离线最多补算 {RULES.offlineCapHours}{" "}
              小时，以下是期间阈值变化的先后顺序：
            </p>
            {report.length === 0 ? (
              <p className="repair-safe">
                <ShieldCheck size={14} />
                期间没有发生任何阈值变化，水箱保持平稳。
              </p>
            ) : (
              <ol className="repair-events">
                {report.map((e, i) => (
                  <li key={i}>
                    <time>{fmtClock(e.t)}</time>
                    {e.text}
                  </li>
                ))}
              </ol>
            )}
            <button
              className="primary"
              autoFocus
              onClick={() => send({ type: "tank-dismiss-report" })}
            >
              知道了
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
