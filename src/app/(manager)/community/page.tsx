// Community (PJ), formerly "Share". Server part: everything for the active
// campus. Inventory's "Offer on Community" arrives with ?offer=<productId>,
// "Request items" / "Request more" with ?request=<name>&category=<category>.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { CommunityView } from "@/components/community/CommunityView";

export default function CommunityPage(props: PageProps<"/community">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <CommunityData searchParams={props.searchParams} />
    </Suspense>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 100) : null);

async function CommunityData({ searchParams }: { searchParams: PageProps<"/community">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();
  const data = await getAppRepository(today).listCommunity(campusId, today);

  const offer = str(sp.offer);
  const request = str(sp.request);
  const initialModal = offer
    ? ({ kind: "offer", preset: { productId: offer } } as const)
    : request !== null
      ? ({ kind: "request", preset: { name: request, category: str(sp.category) ?? "Canned Goods" } } as const)
      : null;

  return <CommunityView campusId={campusId} data={data} todayIso={today} initialModal={initialModal} />;
}
