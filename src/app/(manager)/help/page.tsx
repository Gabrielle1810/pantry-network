// Help (PK.2): how food moves through Pantry Network, each step linking to its
// page. Students reach their page only through the QR poster, so that step
// links to the poster.
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { COMMUNITY_LABEL, COMMUNITY_SLUG } from "@/lib/labels";

const STEPS = [
  { href: "/poster", title: "Print the QR poster", text: "Tape it by the shelves. Students scan it to log what they take." },
  {
    href: "/add",
    title: "Add stock",
    text: "On a phone, point the camera at the label and we read the name and date. On a laptop, type it in. Dates are optional.",
  },
  {
    href: "/poster",
    title: "Students tap what they took",
    text: "Honor system: no login, no names. Expired, empty and set-aside items are hidden from them.",
  },
  { href: "/inventory", title: "Check Inventory", text: "Smart cards on top, one product list below. Stock is counted for you from what comes in and goes out." },
  { href: "/takeout", title: "Review Take-out", text: "Student scans and staff removals in one feed. Record anything that left without a scan, or fix an entry." },
  {
    href: `/${COMMUNITY_SLUG}`,
    title: `Share through ${COMMUNITY_LABEL}`,
    text: "Claim what you need from nearby campuses and offer what you can spare. Stock moves when the pickup is done.",
  },
];

export default function HelpPage() {
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Help</h1>
        <span className="text-[15px] text-muted">How food moves through Pantry Network</span>
      </header>
      <ol className="flex max-w-3xl flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Link
              href={s.href}
              className="flex min-h-16 items-center gap-4 rounded-lg border border-line bg-surface p-4 hover:bg-hover"
            >
              <b className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary text-sm text-white">{i}</b>
              <span className="min-w-0 flex-1">
                <b className="block">{s.title}</b>
                <small className="text-muted">{s.text}</small>
              </span>
              <Icon name="chevron-right" size={18} className="flex-none text-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
