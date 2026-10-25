"use client";

// Phone top bar for manager pages (below 768 px): brand, campus switcher, and a
// horizontally scrollable row of the same nav links as the sidebar.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { CampusSwitcher } from "./CampusSwitcher";
import { NAV, FOOT, isActive } from "./nav";

interface CampusOption {
  id: string;
  name: string;
}

export function MobileNav({ active, campuses }: { active: string; campuses: CampusOption[] }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-surface px-4 pb-2 pt-3 md:hidden print:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-white">
            <Icon name="package" size={16} />
          </span>
          Pantry Network
        </span>
        <div className="w-48 min-w-0">
          <CampusSwitcher active={active} campuses={campuses} />
        </div>
      </div>
      <nav aria-label="Main" className="-mx-4 flex gap-1 overflow-x-auto px-4">
        {[...NAV, ...FOOT].map(({ href, label, icon }) => {
          const on = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full px-3 text-sm font-medium ${
                on ? "bg-primary text-white" : "text-muted hover:bg-hover"
              }`}
            >
              <Icon name={icon} size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
