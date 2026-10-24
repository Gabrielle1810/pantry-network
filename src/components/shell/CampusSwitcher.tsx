"use client";

// Campus switcher (PC.4). Posts the chosen campus to /api/campus and refreshes
// so manager data re-scopes. Updates in place — no full reload (PA.2/PG.1).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

interface CampusOption {
  id: string;
  name: string;
}

export function CampusSwitcher({
  active,
  campuses,
}: {
  active: string;
  campuses: CampusOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const current = campuses.find((c) => c.id === active) ?? campuses[0];

  async function switchTo(id: string) {
    if (id === active || busy) return;
    setBusy(true);
    try {
      await fetch("/api/campus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campusId: id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center justify-between gap-2 rounded border border-line p-2.5 text-left">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{current?.name ?? "Campus"}</span>
        <span className="block text-xs text-muted">Pantry manager</span>
      </span>
      <span className="relative flex items-center">
        <Icon name="chevrons-up-down" size={16} className="text-muted" />
        <select
          aria-label="Switch campus"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={active}
          disabled={busy}
          onChange={(e) => switchTo(e.target.value)}
        >
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
