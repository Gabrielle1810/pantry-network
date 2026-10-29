// Settings (PK). Server part: the active campus's inventory feeds the morning
// email preview (same rules as the smart cards).
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { campusName } from "@/lib/campus";
import { morningEmail } from "@/lib/settings";
import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading settings…</p>}>
      <SettingsData />
    </Suspense>
  );
}

async function SettingsData() {
  await connection();
  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();
  const repo = getAppRepository(today);
  const rows = await repo.listInventory(campusId, today);
  const name = campusName(campusId);
  return <SettingsView campusName={name} email={morningEmail(rows, today, name)} storage={repo.name} />;
}
