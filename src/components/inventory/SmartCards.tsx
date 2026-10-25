"use client";

// The four Inventory smart cards (PD.1). Models and actions come from
// src/lib/inventory. Links navigate (Add items, Request items, Offer on
// Community, Mark as removed); "See all N" / "See list" switch the tab in place.
import Link from "next/link";
import { SmartCardShell, cardAction } from "@/components/ui/SmartCard";
import type { InventoryTabKey, SmartCardModel } from "@/lib/inventory";

export function SmartCards({ cards, onTab }: { cards: SmartCardModel[]; onTab: (tab: InventoryTabKey) => void }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <SmartCardShell key={c.label} tone={c.tone} icon={c.icon} label={c.label} num={c.num} title={c.title} sub={c.sub}>
          {c.actions?.map((a) => {
            const cls = a.primary ? cardAction.primary : cardAction.plain;
            return a.href ? (
              <Link key={a.label} href={a.href} className={cls}>
                {a.label}
              </Link>
            ) : (
              <button key={a.label} type="button" className={cls} onClick={() => a.tab && onTab(a.tab)}>
                {a.label}
              </button>
            );
          })}
        </SmartCardShell>
      ))}
    </section>
  );
}
