export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
export function fmtHours(h: number): string {
  return h >= 10 ? `${Math.round(h)} 小时` : `${h.toFixed(1)} 小时`;
}
