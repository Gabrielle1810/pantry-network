"use client";

// "Saved to Inventory" (screenshot 4) for the phone, a compact panel for the
// desktop typed form, and the running "This delivery" list.
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { categoryMeta } from "@/lib/items/category-meta";
import { addedPill, savedLine, type DeliveryLine, type SavedSummary } from "@/lib/intake";
import { Badge, PhoneHeader } from "./PhoneFrame";

function Hero({ summary, compact = false }: { summary: SavedSummary; compact?: boolean }) {
  const m = categoryMeta(summary.category);
  return (
    <div className={`grid w-full place-items-center rounded-[28px] bg-green-soft ${compact ? "py-8" : "aspect-[6/5]"}`}>
      <div className="relative">
        <span className="grid h-28 w-28 place-items-center rounded-3xl bg-surface shadow-sm" style={{ color: m.fg }}>
          <Icon name={m.icon} size={44} />
        </span>
        <span className="absolute -right-16 -top-3 whitespace-nowrap rounded-full bg-surface px-3 py-1 text-sm font-semibold text-green shadow-sm">
          {addedPill(summary)}
        </span>
      </div>
    </div>
  );
}

export function DeliveryList({ delivery }: { delivery: DeliveryLine[] }) {
  if (delivery.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <small className="text-muted">This delivery</small>
      {delivery.map((x, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span>{x.name}</span>
          <b>+{x.added}</b>
        </div>
      ))}
    </div>
  );
}

function NextStep({ onClick, icon }: { onClick: () => void; icon: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:bg-hover"
    >
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-green-soft text-green">
        <Icon name={icon} size={20} />
      </span>
      <span className="flex-1">
        <small className="block text-muted">Next step</small>
        <b className="text-[17px]">Add another item</b>
      </span>
      <Icon name="chevron-right" size={20} />
    </button>
  );
}

export function SavedScreen({
  summary,
  delivery,
  onAddAnother,
  onFinish,
}: {
  summary: SavedSummary;
  delivery: DeliveryLine[];
  onAddAnother: () => void;
  onFinish: () => void;
}) {
  return (
    <>
      <PhoneHeader action={{ label: "Done", onClick: onFinish }} />
      <Hero summary={summary} />
      <Badge tone="green" label="Saved" />
      <div role="status" className="text-center">
        <h2 className="text-2xl font-bold">Saved to Inventory</h2>
        <p className="mt-1 text-muted">{savedLine(summary)}</p>
      </div>
      <NextStep onClick={onAddAnother} icon="camera" />
      <DeliveryList delivery={delivery} />
      <div className="flex-1" />
      <button type="button" onClick={onFinish} className="mx-auto min-h-11 px-2 text-muted underline">
        Finish
      </button>
    </>
  );
}

export function SavedPanel({ summary, onAddAnother }: { summary: SavedSummary; onAddAnother: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <Hero summary={summary} compact />
      <div role="status" className="text-center">
        <h2 className="text-2xl font-bold">Saved to Inventory</h2>
        <p className="mt-1 text-muted">{savedLine(summary)}</p>
      </div>
      <NextStep onClick={onAddAnother} icon="plus" />
      <Link href="/inventory" className="mx-auto inline-flex min-h-11 items-center px-2 text-muted underline">
        Finish
      </Link>
    </div>
  );
}
