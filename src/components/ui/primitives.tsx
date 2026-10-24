// Shared presentational primitives (PL). No business logic. Tailwind utilities
// map to the ported theme tokens. All interactive controls meet 44px targets
// and carry accessible names where icon-only (PG.3).
import { Icon } from "./Icon";
import { categoryMeta } from "@/lib/items/category-meta";
import { STATUS_LABEL, type Status } from "@/lib/status";

const STATUS_DOT: Record<Status, string> = {
  good: "bg-green",
  low: "bg-bar-r",
  out: "bg-ink/50",
  soon: "bg-blue",
  expired: "bg-red",
  nodate: "bg-amber-2",
};

const STATUS_STYLE: Record<Status, string> = {
  good: "bg-green-bg text-green",
  low: "bg-red-bg text-red",
  out: "bg-chip text-chip-ink",
  soon: "bg-blue-bg text-blue",
  expired: "bg-red-bg text-red",
  nodate: "bg-amber-bg text-amber",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Thumb({ category, size = "md" }: { category: string; size?: "sm" | "md" | "lg" }) {
  const m = categoryMeta(category);
  const px = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const ic = size === "sm" ? 15 : size === "lg" ? 24 : 18;
  return (
    <span className={`grid flex-none place-items-center rounded-xl ${px}`} style={{ background: m.bg, color: m.fg }}>
      <Icon name={m.icon} size={ic} />
    </span>
  );
}

export function StockBar({ onShelf, lastRestock }: { onShelf: number; lastRestock: number }) {
  const ratio = lastRestock ? onShelf / lastRestock : 0;
  const tone = ratio >= 0.5 ? "bg-bar-g" : ratio >= 0.25 ? "bg-bar-a" : "bg-bar-r";
  const width = Math.max(ratio * 100, onShelf ? 4 : 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm">
        <b className={onShelf === 0 ? "text-red" : ""}>{onShelf}</b>
        <span className="text-muted"> of {lastRestock}</span>
        {onShelf === 0 ? <span className="text-red"> · out</span> : null}
      </div>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/** − value + stepper. The value updates in place; buttons have accessible names. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 999,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const btn =
    "grid h-11 w-11 place-items-center rounded-xl bg-chip text-lg font-semibold hover:bg-line disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="h-11 w-14 rounded-lg bg-transparent text-center text-lg font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className={btn} aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "blue" | "amber" | "red" }) {
  const styles = {
    neutral: "bg-chip text-chip-ink",
    green: "bg-green-bg text-green",
    blue: "bg-blue-bg text-blue",
    amber: "bg-amber-bg text-amber",
    red: "bg-red-bg text-red",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>{children}</span>;
}
