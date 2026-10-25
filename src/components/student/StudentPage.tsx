"use client";

// Student take-out screen: tap + for what you took, press Done, get a thank-you.
// Public. No login, no names, no personal data. The server re-checks every
// quantity, so this page is convenience only.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Thumb } from "@/components/ui/primitives";
import { newKey } from "@/components/add/api";
import { pluralizeUnit } from "@/lib/items/units";
import {
  STUDENT_GROUPS,
  cartLines,
  cartTotal,
  filterStudentRows,
  setCart,
  type Cart,
} from "@/lib/student";

export interface StudentItem {
  productId: string;
  name: string;
  unit: string;
  category: string;
  /** On the shelf minus anything set aside for Community. */
  available: number;
  useSoon: boolean;
}

interface Thanks {
  held: boolean;
  lines: { name: string; qty: number }[];
}

export function StudentPage({ token, campusName, items }: { token: string; campusName: string; items: StudentItem[] }) {
  const router = useRouter();
  const [cart, setCartState] = useState<Cart>({});
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<Thanks | null>(null);
  // One id per Done press; kept on failure so a retry can't double-subtract.
  const submissionId = useRef<string | null>(null);

  const byId = new Map(items.map((i) => [i.productId, i]));
  const list = filterStudentRows(
    items.map((i) => ({ ...i, status: i.useSoon ? ("soon" as const) : ("good" as const) })),
    group,
    query,
  );
  const total = cartTotal(cart);
  const picked = cartLines(cart);

  async function done() {
    if (busy || total === 0) return;
    setBusy(true);
    setError(null);
    submissionId.current ??= newKey();
    try {
      const res = await fetch("/api/student/takeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, submissionId: submissionId.current, lines: picked }),
      });
      if (res.status === 404) {
        setError("This link doesn't look right. Please scan the poster again.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      const json = (await res.json()) as { status: "recorded" | "held" | "empty"; lines: { name: string; qty: number }[] };
      submissionId.current = null;
      setCartState({});
      router.refresh();
      if (json.status === "empty") {
        setError("Sorry, those items just ran out. Please check the list and try again.");
        return;
      }
      setThanks({ held: json.status === "held", lines: json.lines });
    } catch {
      setError("We couldn't reach the pantry. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const frame = "mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-5";

  if (thanks) {
    return (
      <main className={`${frame} pb-8`}>
        <PantryHeader campusName={campusName} />
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-green text-white">
            <Icon name="heart" size={34} />
          </span>
          <h1 className="text-3xl font-bold">Thank you!</h1>
          <p role="status" className="text-muted">
            {thanks.held
              ? "Your list was sent to the pantry team."
              : `You took ${thanks.lines.map((l) => `${l.name.toLowerCase()} ×${l.qty}`).join(", ")}. Enjoy.`}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {thanks.lines.map((l) => (
            <li key={l.name} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>{l.name}</span>
              <b>×{l.qty}</b>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setThanks(null)}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:bg-hover"
        >
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-green-soft text-green">
            <Icon name="plus" size={20} />
          </span>
          <span className="flex-1">
            <small className="block text-muted">Forgot something?</small>
            <b className="text-[17px]">Add another item</b>
          </span>
          <Icon name="chevron-right" size={20} />
        </button>
        <p className="mt-auto flex items-center justify-center gap-1.5 pb-2 text-center text-sm text-muted">
          <Icon name="eye-off" size={14} />
          No names saved. This only helps the pantry restock.
        </p>
      </main>
    );
  }

  return (
    <main className={`${frame} pb-44`}>
      <PantryHeader campusName={campusName} />
      <div>
        <h1 className="text-2xl font-bold">What did you take?</h1>
        <p className="mt-1 text-muted">Tap + for each item. No login, no names.</p>
      </div>

      <label className="flex min-h-12 items-center gap-2 rounded-xl border border-line-2 bg-surface px-3">
        <Icon name="search" size={16} className="text-muted" />
        <span className="sr-only">Search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, like ramen or milk"
          className="min-h-11 flex-1 bg-transparent outline-none"
        />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Categories">
        {STUDENT_GROUPS.map((g) => {
          const on = group === g.group;
          return (
            <button
              key={g.label}
              type="button"
              aria-pressed={on}
              onClick={() => setGroup(g.group)}
              className={`min-h-11 flex-none rounded-full border px-4 text-sm font-medium ${
                on ? "border-primary bg-primary text-white" : "border-line-2 bg-surface hover:bg-hover"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-2">
        {list.length === 0 ? (
          <li className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface px-4 py-10 text-muted">
            <Icon name="search-x" size={22} />
            <b className="text-ink">Nothing matches</b>
          </li>
        ) : null}
        {list.map((i) => {
          const n = cart[i.productId] ?? 0;
          return (
            <li
              key={i.productId}
              className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 ${n ? "border-green" : "border-line"}`}
            >
              <Thumb category={i.category} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{i.name}</b>
                <small className="flex flex-wrap items-center gap-x-2 text-muted">
                  {i.available} {pluralizeUnit(i.unit, i.available)} on the shelf
                  {i.useSoon ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-bg px-2 py-0.5 text-xs font-medium text-blue">
                      <Icon name="clock" size={11} />
                      Use soon
                    </span>
                  ) : null}
                </small>
              </div>
              <div className="flex flex-none items-center gap-1">
                {n > 0 ? (
                  <>
                    <button
                      type="button"
                      aria-label={`One fewer ${i.name}`}
                      onClick={() => setCartState((c) => setCart(c, i.productId, n - 1, i.available))}
                      className="grid h-11 w-11 place-items-center rounded-xl bg-chip text-lg font-semibold hover:bg-line"
                    >
                      −
                    </button>
                    <b className="w-7 text-center text-lg" aria-live="polite">
                      {n}
                    </b>
                  </>
                ) : null}
                <button
                  type="button"
                  aria-label={`Add one ${i.name}`}
                  disabled={n >= i.available}
                  onClick={() => setCartState((c) => setCart(c, i.productId, n + 1, i.available))}
                  className={`grid h-11 w-11 place-items-center rounded-xl disabled:opacity-40 ${
                    n ? "bg-primary text-white" : "bg-chip hover:bg-line"
                  }`}
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-app/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {picked.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted">You took</span>
              {picked.map((l) => (
                <span key={l.productId} className="rounded-full bg-green-bg px-2.5 py-1 text-xs font-medium text-green">
                  {byId.get(l.productId)?.name} ×{l.qty}
                </span>
              ))}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={done}
            disabled={busy || total === 0}
            className="min-h-14 w-full rounded-2xl bg-primary text-[17px] font-semibold text-white disabled:opacity-45"
          >
            {busy ? "Sending…" : total ? `Done · ${total} item${total === 1 ? "" : "s"}` : "Tap + on what you took"}
          </button>
        </div>
      </div>
    </main>
  );
}

function PantryHeader({ campusName }: { campusName: string }) {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-white">
        <Icon name="package" size={15} />
      </span>
      {campusName} Food Pantry
    </div>
  );
}
