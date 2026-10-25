// Manager route-group layout (PC.1). Desktop: sidebar + main. Phone: top bar +
// main. Reads the active campus + live campuses server-side. All manager pages
// render inside this; guarded by the PIN via middleware.
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNav } from "@/components/shell/MobileNav";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Suspense fallback={<div className="hidden w-[232px] flex-none border-r border-line bg-surface md:block" />}>
        <ShellNav />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col gap-5 bg-surface px-4 pb-24 pt-5 md:px-7 md:pt-6 print:p-0">{children}</main>
    </div>
  );
}

async function ShellNav() {
  await connection();
  const jar = await cookies();
  const active = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const campuses = (await getAppRepository(todayInTz()).listCampuses()).map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <Sidebar active={active} campuses={campuses} />
      <MobileNav active={active} campuses={campuses} />
    </>
  );
}
