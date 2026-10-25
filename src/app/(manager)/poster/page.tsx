// QR poster (PI.4). Behind the PIN. Shows the active campus's QR code, which
// links to its random-token student URL. Print it and tape it by the shelves.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { qrSvg, studentUrl } from "@/lib/qr";
import { PosterView } from "@/components/poster/PosterView";

export default function PosterPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading poster…</p>}>
      <PosterData />
    </Suspense>
  );
}

async function PosterData() {
  await connection();
  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const campus = await getAppRepository(todayInTz()).getCampus(campusId);
  if (!campus) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">QR poster</h1>
        <p className="text-muted">
          This campus has no student link yet. Load the sample data first (see Settings), then come back.
        </p>
      </div>
    );
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = studentUrl(`${proto}://${host}`, campus.studentToken);
  return <PosterView campusName={campus.name} url={url} qr={qrSvg(url)} />;
}
