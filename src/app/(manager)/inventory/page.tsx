// Inventory page (PD). Server component: reads derived rows and recent history
// for the active campus and hands them to the client view, which owns tabs,
// search, the Full sheet, selection and the edit drawer in place.
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
  const [rows, history] = await Promise.all([repo.listInventory(active, today), repo.listHistory(active)]);
  return (
    <InventoryView
      rows={rows}
      history={history}
      today={today}
      nowIso={new Date().toISOString()}
      campusName={campusName(active)}
    />
  );
}
