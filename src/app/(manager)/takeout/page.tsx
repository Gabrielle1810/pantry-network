// Take-out (PH). Server part: feed (today, no names), the campus's inventory for
// the Record/Fix modals, and any "Count looks off" checks. "Mark as removed" on
// the Expired card arrives here with ?remove=expired and opens Record prefilled.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { TakeoutView } from "@/components/takeout/TakeoutView";

export default function TakeoutPage(props: PageProps<"/takeout">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading take-out…</p>}>
      <TakeoutData searchParams={props.searchParams} />
    </Suspense>
  );
}

async function TakeoutData({ searchParams }: { searchParams: PageProps<"/takeout">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();
  const repo = getAppRepository(today);
  const [feed, rows, checks] = await Promise.all([
    repo.listFeed(campusId, today),
    repo.listInventory(campusId, today),
    repo.listCountChecks(campusId, today),
  ]);
  return (
    <TakeoutView
      feed={feed}
      rows={rows}
      checks={checks}
      nowIso={new Date().toISOString()}
      initialRemove={sp.remove === "expired"}
    />
  );
}
