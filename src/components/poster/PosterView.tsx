"use client";

// Printable poster. The sidebar, toolbar and URL line are hidden when printing.
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { btn } from "@/components/ui/Modal";
import type { QrSvg } from "@/lib/qr";

export function PosterView({ campusName, url, qr }: { campusName: string; url: string; qr: QrSvg }) {
  const view = qr.size + 4; // 2-module quiet zone on each side
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/takeout" className={`${btn.base} ${btn.plain}`}>
          <Icon name="arrow-left" size={15} />
          Back
        </Link>
        <button type="button" className={`${btn.base} ${btn.dark}`} onClick={() => window.print()}>
          <Icon name="printer" size={15} />
          Print poster
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-5 rounded-3xl border border-line bg-surface p-8 text-center print:max-w-none print:border-0">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">
            <Icon name="package" size={17} />
          </span>
          {campusName} Food Pantry
        </div>
        <h1 className="text-5xl font-bold tracking-tight">Took something?</h1>
        <p className="max-w-sm text-lg text-muted">Scan this code and tap what you took. It helps us restock.</p>
        <svg
          viewBox={`-2 -2 ${view} ${view}`}
          role="img"
          aria-label={`QR code for the ${campusName} food pantry take-out page`}
          className="h-72 w-72"
          shapeRendering="crispEdges"
        >
          <rect x={-2} y={-2} width={view} height={view} fill="#ffffff" />
          <path d={qr.path} fill="#111714" />
        </svg>
        <ol className="flex flex-col gap-2 text-left text-lg">
          {["Scan with your phone camera", "Tap + on what you took", "Press Done"].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <b className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary text-sm text-white">{i + 1}</b>
              {s}
            </li>
          ))}
        </ol>
        <p className="font-semibold">No app. No login. No names.</p>
      </div>

      <p className="text-center text-sm text-muted print:hidden">
        This code opens <span className="break-all font-medium text-ink">{url}</span>. The link ends in a random code, so
        only people who see the poster can open it.
      </p>
    </div>
  );
}
