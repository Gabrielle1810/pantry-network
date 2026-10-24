// Manager route-group layout (PC.1). Desktop-first shell: sidebar + main. Reads
// the active campus + live campus list server-side and passes them to the
// sidebar. All manager pages (/inventory, /add, /takeout, /community, /settings,
// /help) render inside this. Guarded by the PIN via middleware.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<div className="w-[232px] flex-none border-r border-line bg-surface" />}>
        <ShellSidebar />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col gap-5 bg-surface px-7 pb-24 pt-6">{children}</main>
    </div>
  );
}

async function ShellSidebar() {
  await connection();
  const jar = await cookies();
  const active = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const repo = getAppRepository(todayInTz());
  const campuses = await repo.listCampuses();
  return <Sidebar active={active} campuses={campuses.map((c) => ({ id: c.id, name: c.name }))} />;
}
