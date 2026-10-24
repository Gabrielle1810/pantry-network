// Phone-first frame for the camera flow. It covers the manager shell so the
// screen matches the Add stock screenshots: header link, centered title,
// bracketed photo frame, and a round status badge.
import { Icon } from "@/components/ui/Icon";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-app">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
        {children}
      </div>
    </div>
  );
}

export function PhoneHeader({
  action,
  title = "Add stock",
}: {
  action: { label: string; onClick: () => void } | null;
  title?: string;
}) {
  return (
    <div className="grid min-h-12 grid-cols-[1fr_auto_1fr] items-center">
      <div>
        {action ? (
          <button type="button" onClick={action.onClick} className="min-h-11 rounded px-1 text-[17px] font-medium text-green">
            {action.label}
          </button>
        ) : null}
      </div>
      <h1 className="text-[17px] font-semibold">{title}</h1>
      <span />
    </div>
  );
}

/** The four white corner brackets of the viewfinder. */
export function Corners() {
  const base = "pointer-events-none absolute h-8 w-8 border-white";
  return (
    <>
      <span aria-hidden className={`${base} left-4 top-4 rounded-tl-md border-l-[3px] border-t-[3px]`} />
      <span aria-hidden className={`${base} right-4 top-4 rounded-tr-md border-r-[3px] border-t-[3px]`} />
      <span aria-hidden className={`${base} bottom-4 left-4 rounded-bl-md border-b-[3px] border-l-[3px]`} />
      <span aria-hidden className={`${base} bottom-4 right-4 rounded-br-md border-b-[3px] border-r-[3px]`} />
    </>
  );
}

/** Round badge overlapping the photo's bottom edge: green check or amber "?". */
export function Badge({ tone, label }: { tone: "green" | "amber"; label: string }) {
  return (
    <div className="relative z-10 -mt-12 flex justify-center">
      <span
        role="img"
        aria-label={label}
        className={`grid h-16 w-16 place-items-center rounded-full border-[5px] border-app text-white ${
          tone === "green" ? "bg-green" : "bg-amber-2"
        }`}
      >
        {tone === "green" ? <Icon name="check" size={26} strokeWidth={3} /> : <span className="text-xl font-bold">?</span>}
      </span>
    </div>
  );
}
