// Add stock (Step 3). Server part: resolves the active campus and, when opened
// from "Add items" on Inventory (?product=…), the product to prefill. The client
// picks the camera flow (phone) or the typed form (desktop) by capability.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { campusName } from "@/lib/campus";
import type { ReviewDraft } from "@/lib/intake";
import { AddStock } from "@/components/add/AddStock";

export default function AddStockPage(props: PageProps<"/add">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <AddData searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AddData({ searchParams }: { searchParams: PageProps<"/add">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const productId = typeof sp.product === "string" ? sp.product : null;
  const jar = await cookies();
  const active = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();

  let prefill: Partial<ReviewDraft> | null = null;
  if (productId) {
    const row = await getAppRepository(today).getProduct(active, productId, today);
    if (row) {
      prefill = {
        name: row.name,
        brand: row.brand ?? "",
        unit: row.unit,
        category: row.category,
        noExpire: row.noExpire,
        source: row.source,
      };
    }
  }

  return <AddStock today={today} prefill={prefill} campusName={campusName(active)} />;
}
