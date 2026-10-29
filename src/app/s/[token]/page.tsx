// Student page (PI). PUBLIC: no PIN, no login, no names. Reached only through a
// campus's random student token (the QR poster URL), never the campus id or the
// manager's campus cookie. Shows only what a student may take: in stock, not
// expired, and not set aside for Community.
//
// The real HTTP 404 for a wrong token (or a plain campus id) comes from
// src/proxy.ts, which runs before rendering: once a page streams, its status is
// fixed at 200 (Next.js docs, "The HTTP contract"). This page re-checks the
// token as a backstop and renders not-found without any inventory.
// `instant = false` lets this route block on that check.
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { loadStudentPage } from "@/lib/student/page-data";
import { StudentPage } from "@/components/student/StudentPage";

export const instant = false;

export const metadata: Metadata = {
  title: "Took something? · Pantry Network",
  robots: { index: false, follow: false },
};

export default async function StudentRoute(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  await connection();
  const today = todayInTz();
  const data = await loadStudentPage(getAppRepository(today), token, today);
  if (!data) notFound();
  return <StudentPage token={token} campusName={data.campusName} items={data.items} />;
}
