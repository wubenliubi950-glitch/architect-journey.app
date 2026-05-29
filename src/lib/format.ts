// 表示用フォーマットユーティリティ

export function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function minutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}時間` : `${h}時間${rest}分`;
}

export function timeHM(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function dateLabel(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
