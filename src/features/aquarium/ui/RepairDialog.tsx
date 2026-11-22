import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, X } from "lucide-react";
import type { GameDocument } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { species } from "../../../shared/catalog";
import { FACILITIES, RULES } from "../model/rules";
import { solveRepair, type SolveResult } from "../lib/solver";
import { fmtClock } from "../lib/format";

function DangerWindow({ result }: { result: SolveResult }) {
  const b = result.baseline;
  if (b.healthy)
    return (
      <p className="repair-safe">
        当前布置未来 {RULES.guaranteeHours} 小时全程健康，最低溶氧{" "}
        {b.minOxygen.toFixed(1)} mg/L（{fmtClock(b.minOxygenAt)}），无需改动。
      </p>
    );
  return (
    <div className="repair-danger">
      <p>
        <AlertTriangle size={14} />
        最危险时段：{fmtClock(b.firstBreachAt!)} 起
        {b.dangerEnd ? ` 至 ${fmtClock(b.dangerEnd)}` : "，持续到窗口结束"}
        ，因「{b.breach}」失去健康；期间最低溶氧 {b.minOxygen.toFixed(1)}{" "}
        mg/L（{fmtClock(b.minOxygenAt)}）。
      </p>
      {b.events.length > 0 && (
        <ol className="repair-events">
          {b.events.slice(0, 8).map((e, i) => (
            <li key={i}>
              <time>{fmtClock(e.t)}</time>
              {e.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 修复方案预览：列出最危险时段、消除它的设施改动与移鱼清单，确认后生效。 */
export function RepairDialog({
  doc,
  send,
  onClose,
}: {
  doc: GameDocument;
  send: (c: Command) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<SolveResult | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(solveRepair(doc, Date.now()));
    }, 30);
    return () => clearTimeout(timer);
  }, [doc]);
  const plan = result?.plan ?? null;
  const changed =
    !!plan &&
    (plan.removeFish.length > 0 ||
      plan.addFacilities.length > 0 ||
      plan.removeFacilities.length > 0);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="repair-title"
        className="guide tank-repair"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-btn close"
          aria-label="关闭修复预览"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="eyebrow">REPAIR PLAN</span>
        <h2 id="repair-title">未来 {RULES.guaranteeHours} 小时修复方案</h2>
        {!result ? (
          <p className="repair-computing">
            <Loader2 size={16} className="spin" />
            正在按同一套生态规则逐分钟演算…
          </p>
        ) : (
          <>
            <DangerWindow result={result} />
            {result.status === "ok" && (
              <>
                {changed ? (
                  <div className="repair-plan">
                    <h3>
                      消除该时段危险的改动（移鱼 {plan!.removeFish.length} 尾 ·
                      设施改动{" "}
                      {plan!.addFacilities.length +
                        plan!.removeFacilities.length}{" "}
                      处）
                    </h3>
                    <ul>
                      {plan!.removeFish.map((id) => {
                        const c = doc.bag.find((x) => x.id === id);
                        return (
                          <li key={id}>
                            移回背包：{c ? species(c.fish).name : id}
                            {c ? `（${c.weight.toFixed(2)} kg）` : ""}
                          </li>
                        );
                      })}
                      {plan!.addFacilities.map((kind, i) => (
                        <li key={`add-${i}`}>增设：{FACILITIES[kind].name}</li>
                      ))}
                      {plan!.removeFacilities.map((id) => {
                        const f = doc.tank.facilities.find((x) => x.id === id);
                        return (
                          <li key={id}>
                            移除：{f ? FACILITIES[f.kind].name : id}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="repair-safe">无需任何改动。</p>
                )}
                {result.after && (
                  <p className="repair-safe">
                    <ShieldCheck size={14} />
                    方案后 {RULES.guaranteeHours} 小时全程整箱健康，最低溶氧{" "}
                    {result.after.minOxygen.toFixed(1)} mg/L（
                    {fmtClock(result.after.minOxygenAt)}）。
                  </p>
                )}
                <div className="repair-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      send({ type: "tank-apply-plan", plan: plan! });
                      onClose();
                    }}
                  >
                    确认方案，开启 {RULES.guaranteeHours} 小时保障
                  </button>
                  <button className="text-btn" onClick={onClose}>
                    再想想
                  </button>
                </div>
              </>
            )}
            {result.status === "infeasible" && (
              <p className="repair-fail">
                在保留全部锁定鱼与设施、预算 {RULES.repairBudget}{" "}
                点的约束下，已穷举 {result.evaluated}{" "}
                种组合仍无法维持全程健康。可解除部分锁定（鱼或设施）后再试。
              </p>
            )}
            {result.status === "unfinished" && (
              <p className="repair-fail">
                组合空间过大，已评估 {result.evaluated}{" "}
                种仍未算完，暂不能断定有解或无解。可先手动移走部分鱼或解除锁定，缩小组合后再试。
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
