"use client";

// Desktop manager sidebar (PC.1/PC.2), shown from 768 px up. Brand, campus
// switcher, primary nav, and Help + Settings. No "Student page" link.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { CampusSwitcher } from "./CampusSwitcher";
import { NAV, FOOT, isActive, type NavItem } from "./nav";

interface CampusOption {
  id: string;
  name: string;
}

export function Sidebar({ active, campuses }: { active: string; campuses: CampusOption[] }) {
  const pathname = usePathname();

  const link = ({ href, label, icon }: NavItem) => {
    const on = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? "page" : undefined}
        className={`flex min-h-11 items-center gap-2.5 rounded-sm px-3 py-2.5 text-[15px] font-medium ${
          on ? "bg-hover font-semibold text-ink" : "text-muted hover:bg-hover hover:text-ink"
        }`}
      >
        <Icon name={icon} size={18} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] flex-none flex-col gap-5 border-r border-line bg-surface p-4 md:flex">
      <div className="flex items-center gap-2.5 p-1 text-[17px] font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-white">
          <Icon name="package" size={16} />
        </span>
        Pantry Network
      </div>
      <CampusSwitcher active={active} campuses={campuses} />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(link)}
      </nav>
      <div className="flex-1" />
      <nav aria-label="More" className="flex flex-col gap-0.5">
        {FOOT.map(link)}
      </nav>
    </aside>
  );
}
