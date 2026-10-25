// Shared smart-card shell (Inventory, Take-out, Community). Presentational:
// label + optional count, a title and sub-line, then whatever actions you pass.
import { Icon } from "./Icon";

export type CardTone = "red" | "blue" | "gray" | "green" | "amber";

const TONE: Record<CardTone, string> = {
  red: "text-red",
  blue: "text-blue",
  gray: "text-muted",
  green: "text-green",
  amber: "text-amber",
};

export function SmartCardShell({
  tone,
  icon,
  label,
  num,
  title,
  sub,
  highlight,
  children,
}: {
  tone: CardTone;
  icon: string;
  label: string;
  num?: number;
  title: string;
  sub: string;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-h-40 flex-col gap-3 rounded-lg border bg-surface p-4 ${
        highlight ? "border-green-line bg-green-soft" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TONE[tone]}`}>
          <Icon name={icon} size={16} />
          {label}
        </span>
        {num !== undefined ? <span className="text-lg font-bold">{num}</span> : null}
      </div>
      <div className="flex flex-col gap-1">
        <b className="text-[15px] leading-snug">{title}</b>
        <span className="text-sm text-muted">{sub}</span>
      </div>
      <div className="flex-1" />
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

const ACTION = "inline-flex min-h-11 items-center justify-center rounded-[10px] px-3.5 text-sm font-semibold";
export const cardAction = {
  primary: `${ACTION} bg-primary text-white hover:bg-[#2a332e]`,
  plain: `${ACTION} border border-line hover:bg-hover`,
} as const;
