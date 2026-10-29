"use client";

// Settings (PK): morning email preview (preview only, nothing is sent), the
// status rules, and the sample-data actions. "Reset demo data" sits behind a
// confirmation and reuses the guarded seed endpoint (sample data only).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal, btn } from "@/components/ui/Modal";
import { StatusPill, Thumb } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { STATUS_RULES, type MorningEmail } from "@/lib/settings";
import { STATUS_LABEL } from "@/lib/status";

export function SettingsView({
  campusName,
  email,
  storage,
}: {
  campusName: string;
  email: MorningEmail;
  storage: "memory" | "supabase";
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | "load" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  async function seed(reset: boolean) {
    if (busy) return;
    setBusy(reset ? "reset" : "load");
    setError(null);
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; hint?: string };
      if (!res.ok || !json.ok) {
        setError(json.hint ?? "That didn't work. Try again.");
        return;
      }
      setConfirming(false);
      router.refresh();
      toast.show(reset ? "Demo data reset" : "Sample data is loaded");
    } catch {
      setError("We couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <span className="text-[15px] text-muted">{campusName} · Pantry manager</span>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5" aria-labelledby="email-h">
          <div>
            <h2 id="email-h" className="text-lg font-semibold">
              Morning email preview
            </h2>
            <p className="text-sm text-muted">
              Sent at 7 am when something needs attention. Built from the same rules as the smart cards. This is a preview
              only; nothing is sent yet.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-[#fafbf9] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <b>Pantry Network</b>
              <small className="text-muted">7:00 AM · to the {campusName} pantry team</small>
            </div>
            <h3 className="text-base font-semibold">{email.heading}</h3>
            {email.items.length === 0 ? (
              <p className="text-sm text-muted">Every item has stock and nothing expires in the next two weeks.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {email.items.map((i) => (
                  <li key={i.productId} className="flex flex-wrap items-center gap-3 py-2">
                    <Thumb category={i.category} size="sm" />
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm">{i.name}</b>
                      <small className="text-muted">{i.sub}</small>
                    </span>
                    <Link href={i.action.href} className={`${btn.base} ${btn.dark}`}>
                      {i.action.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5" aria-labelledby="rules-h">
            <h2 id="rules-h" className="text-lg font-semibold">
              Status rules
            </h2>
            <p className="text-sm text-muted">Each item gets the first status that fits, in this order.</p>
            <ul className="flex flex-col gap-2">
              {STATUS_RULES.map((r) => (
                <li key={r.status} className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusPill status={r.status} />
                  <span>
                    <span className="sr-only">{STATUS_LABEL[r.status]}: </span>
                    {r.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5" aria-labelledby="demo-h">
            <h2 id="demo-h" className="text-lg font-semibold">
              Demo data
            </h2>
            <p className="text-sm text-muted">
              Everything here is invented sample data for six campuses, stored in{" "}
              {storage === "supabase" ? "the Supabase database" : "this server's memory (it resets when the server restarts)"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${btn.base} ${btn.dark}`} onClick={() => setConfirming(true)} disabled={busy !== null}>
                <Icon name="rotate-ccw" size={15} />
                Reset demo data
              </button>
              <button type="button" className={`${btn.base} ${btn.plain}`} onClick={() => seed(false)} disabled={busy !== null}>
                {busy === "load" ? "Loading…" : "Load missing sample data"}
              </button>
            </div>
            {error && !confirming ? (
              <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {confirming ? (
        <Modal
          title="Reset demo data?"
          subtitle="This can't be undone."
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className={`${btn.base} ${btn.plain}`} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={`${btn.base} ${btn.red}`} disabled={busy !== null} onClick={() => seed(true)}>
                <Icon name="rotate-ccw" size={15} />
                {busy === "reset" ? "Resetting…" : "Reset demo data"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Every change on all six sample campuses is removed: stock added, take-outs, offers, requests, pickups and
              remembered fixes. Then the sample data is loaded again.
            </p>
            <p className="text-muted">
              {storage === "supabase"
                ? "Student links and printed QR posters keep working."
                : "In memory mode, student links change, so print the poster again."}
            </p>
            {error ? (
              <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-red">
                {error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {toast.node}
    </>
  );
}
