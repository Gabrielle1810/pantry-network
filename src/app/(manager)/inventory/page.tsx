// Inventory page (PD). Server component: reads derived rows for the active
// campus and hands them to the client view, which owns tabs/search in place.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { campusName } from "@/lib/campus";
import { InventoryView } from "@/components/inventory/InventoryView";

export default function InventoryPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading inventory…</p>}>
      <InventoryData />
    </Suspense>
  );
}

async function InventoryData() {
  await connection();
  const jar = await cookies();
  const active = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();
  const repo = getAppRepository(today);
  const rows = await repo.listInventory(active, today);
  return <InventoryView rows={rows} today={today} campusName={campusName(active)} />;
}
