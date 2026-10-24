// The four Inventory smart cards (PD.1). Presentational; models and their
// actions come from src/lib/inventory. Request/offer/remove actions arrive with
// the Take-out and Community steps.
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { SmartCardModel, CardTone } from "@/lib/inventory";

const TONE: Record<CardTone, string> = {
  red: "text-red",
  blue: "text-blue",
  gray: "text-muted",
  green: "text-green",
  amber: "text-amber",
};

export function SmartCards({ cards }: { cards: SmartCardModel[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="flex min-h-40 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TONE[c.tone]}`}>
              <Icon name={c.icon} size={16} />
              {c.label}
            </span>
            {c.num !== undefined ? <span className="text-lg font-bold">{c.num}</span> : null}
          </div>
          <div className="flex flex-col gap-1">
            <b className="text-[15px] leading-snug">{c.title}</b>
            <span className="text-sm text-muted">{c.sub}</span>
          </div>
          <div className="flex-1" />
          {c.actions?.length ? (
            <div className="flex flex-wrap gap-2">
              {c.actions.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className={`inline-flex min-h-11 items-center justify-center rounded px-3.5 text-sm font-semibold ${
                    a.primary ? "bg-primary text-white hover:bg-[#2a332e]" : "border border-line hover:bg-hover"
                  }`}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
