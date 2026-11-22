import { X } from "lucide-react";
import { DIET, FACILITIES, FACILITY_KINDS, RULES } from "../model/rules";
import { fishCatalog } from "../../../shared/catalog";

/** 规则与阈值面板：所有数值直接取自规则常量，与模拟引擎一致。 */
export function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tank-rules-title"
        className="guide tank-rules"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-btn close"
          autoFocus
          aria-label="关闭规则说明"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="eyebrow">TANK RULES</span>
        <h2 id="tank-rules-title">水箱规则与阈值</h2>
        <ol>
          <li>
            <b>溶氧</b>：健康需要溶氧 ≥ {RULES.hypoxia} mg/L；低于{" "}
            {RULES.critical} mg/L 为危急。水面自然复氧 +{RULES.reaeration}{" "}
            mg/L/h，溶氧上限 {RULES.oxygenMax} mg/L。
          </li>
          <li>
            <b>昼夜</b>：{RULES.dayStart}:00–{RULES.dayEnd}:00 为白天。水草白天
            +{FACILITIES.plant.dayO2}、夜间 {FACILITIES.plant.nightO2}{" "}
            mg/L/h；增氧石昼夜 +{FACILITIES.airstone.dayO2} mg/L/h。
          </li>
          <li>
            <b>耗氧</b>：每尾鱼每小时耗氧 =（0.05 + 0.09 × 体重kg）× 食性系数
            × 进食系数 × 应激系数。应激 ≥ {RULES.stressWarn} 时耗氧 ×1.15。
          </li>
          <li>
            <b>持续缺氧</b>：溶氧连续 {RULES.sustainedMin} 分钟低于{" "}
            {RULES.hypoxia} mg/L 后，鱼群停止进食、耗氧 ×0.6；溶氧回升到{" "}
            {RULES.feedResume} mg/L 以上才恢复进食。饥饿（饱食度 &lt;{" "}
            {RULES.hungryAt}）时耗氧 ×0.85。
          </li>
          <li>
            <b>应激</b>：危急缺氧 +16/h，缺氧 +8/h，停止进食 +5/h，拥挤（占用
            &gt; {RULES.crowdRatio * 100}%）+8/h，掠食鱼无掩体 +12/h，饥饿
            +4/h；无压力源且溶氧 ≥ 5 时 −12/h。应激 ≥ {RULES.stressUnhealthy}{" "}
            即不健康。
          </li>
          <li>
            <b>领地</b>：掠食鱼（
            {fishCatalog
              .filter((f) => DIET[f.id].shelter)
              .map((f) => f.name)
              .join("、")}
            ）各需一处掩体，按体重分配；两尾争一处时，未分到的一尾持续承压。
          </li>
          <li>
            <b>空间</b>：水箱 {RULES.capacity} L。鱼占 3 + 2.5 × 体重kg L；
            {FACILITY_KINDS.map(
              (k) => `${FACILITIES[k].name} ${FACILITIES[k].space} L`,
            ).join("，")}
            。
          </li>
          <li>
            <b>进食与生长</b>：溶氧 ≥ {RULES.hypoxia}、未停食且应激 &lt;{" "}
            {RULES.stressUnhealthy} 时进食，进食中每小时增重{" "}
            {(RULES.growthPerHour * 100).toFixed(1)}%，不超过该鱼种上限。
          </li>
          <li>
            <b>整箱健康</b>：溶氧达标、无持续缺氧、空间不超限、且每尾鱼应激
            &lt; {RULES.stressUnhealthy}，四者同时成立才算整箱健康；终点恢复或
            平均合格不代表中途没有持续缺氧。
          </li>
          <li>
            <b>修复方案</b>：预算 {RULES.repairBudget} 设施点（
            {FACILITY_KINDS.map(
              (k) => `${FACILITIES[k].name} ${FACILITIES[k].cost} 点`,
            ).join("，")}
            ），锁定的鱼与设施不会被改动；优先最少移走鱼，其次最少改动设施，
            保障确认后 {RULES.guaranteeHours} 小时的整箱健康。
          </li>
          <li>
            <b>离线</b>：离线最多补算 {RULES.offlineCapHours}{" "}
            小时，返回时按顺序展示期间的阈值变化；编辑水箱会使旧保障立即失效。
          </li>
        </ol>
        <button className="primary" onClick={onClose}>
          知道了
        </button>
      </section>
    </div>
  );
}
