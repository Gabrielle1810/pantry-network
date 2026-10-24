"use client";

// Manager sidebar (PC.1/PC.2). Brand, campus switcher, primary nav, and a footer
// nav with Help + Settings. NO "Student page" link (PC.2) — students reach their
// page only via the QR poster. "Community" label comes from the single constant.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { CampusSwitcher } from "./CampusSwitcher";
import { COMMUNITY_LABEL, COMMUNITY_SLUG } from "@/lib/labels";

interface CampusOption {
  id: string;
  name: string;
}

const NAV = [
  { href: "/inventory", label: "Inventory", icon: "layout-list" },
  { href: "/add", label: "Add stock", icon: "camera" },
  { href: "/takeout", label: "Take-out", icon: "qr-code" },
  { href: `/${COMMUNITY_SLUG}`, label: COMMUNITY_LABEL, icon: "share-2" },
];

const FOOT = [
  { href: "/help", label: "Help", icon: "circle-help" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar({ active, campuses }: { active: string; campuses: CampusOption[] }) {
  const pathname = usePathname();
  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const link = ({ href, label, icon }: { href: string; label: string; icon: string }) => (
    <Link
      key={href}
      href={href}
      className={`flex min-h-11 items-center gap-2.5 rounded-sm px-3 py-2.5 text-[15px] font-medium ${
        isOn(href) ? "bg-hover font-semibold text-ink" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </Link>
  );

  return (
    <aside className="sticky top-0 flex h-dvh w-[232px] flex-none flex-col gap-5 border-r border-line bg-surface p-4">
      <div className="flex items-center gap-2.5 p-1 text-[17px] font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-white">
          <Icon name="package" size={16} />
        </span>
        Pantry Network
      </div>
      <CampusSwitcher active={active} campuses={campuses} />
      <nav className="flex flex-col gap-0.5">{NAV.map(link)}</nav>
      <div className="flex-1" />
      <nav className="flex flex-col gap-0.5">{FOOT.map(link)}</nav>
    </aside>
  );
}
