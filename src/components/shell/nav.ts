// Manager navigation, shared by the desktop sidebar and the phone top bar.
// No "Student page" entry (PC.2). The Community label comes from one constant.
import { COMMUNITY_LABEL, COMMUNITY_SLUG } from "@/lib/labels";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV: NavItem[] = [
  { href: "/inventory", label: "Inventory", icon: "layout-list" },
  { href: "/add", label: "Add stock", icon: "camera" },
  { href: "/takeout", label: "Take-out", icon: "qr-code" },
  { href: `/${COMMUNITY_SLUG}`, label: COMMUNITY_LABEL, icon: "share-2" },
];

export const FOOT: NavItem[] = [
  { href: "/help", label: "Help", icon: "circle-question-mark" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
