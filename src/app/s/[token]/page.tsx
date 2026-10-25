// Student page (PI). PUBLIC: no PIN, no login, no names. Reached only through a
// campus's random student token (the QR poster URL), never the campus id or the
// manager's campus cookie. Shows only what a student may take: in stock, not
// expired, and not set aside for Community.
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { studentAvailable } from "@/lib/student";
import { StudentPage, type StudentItem } from "@/components/student/StudentPage";

export const metadata: Metadata = {
  title: "Took something? · Pantry Network",
  robots: { index: false, follow: false },
};

export default function StudentRoute(props: PageProps<"/s/[token]">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-muted">Loading…</p>}>
      <StudentData params={props.params} />
    </Suspense>
  );
}

async function StudentData({ params }: { params: PageProps<"/s/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const today = todayInTz();
  const repo = getAppRepository(today);
  const campus = await repo.getCampusByToken(token);
  if (!campus) notFound();
  const rows = await repo.listStudentInventory(campus.id, today);
  const items: StudentItem[] = rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    unit: r.unit,
    category: r.category,
    available: studentAvailable(r),
    useSoon: r.status === "soon",
  }));
  return <StudentPage token={token} campusName={campus.name} items={items} />;
}
