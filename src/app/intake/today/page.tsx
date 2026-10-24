// Minimal /intake/today list (R12.2-R12.4). The data read is dynamic (reflects
// what persisted on each reload), so it lives in an async component wrapped in
// <Suspense> — the pattern cacheComponents wants for runtime data.
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";

export default function TodayPage() {
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Added today</h1>
      <Suspense fallback={<p className="text-gray-600">Loading…</p>}>
        <TodayList />
      </Suspense>
      <a className="text-green-700 underline" href="/intake/test">
        Add another (test page)
      </a>
    </main>
  );
}

async function TodayList() {
  // Mark this render dynamic so a reload always reflects current data.
  await connection();

  const campus = process.env.CAMPUS_ID ?? "campus-a";
  const todayIso = todayInTz();
  const repo = getRepository();

  let items: Awaited<ReturnType<typeof repo.listBatches>> = [];
  let loadError: string | null = null;
  try {
    items = await repo.listBatches(campus, "today", todayIso);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <p className="text-sm text-gray-600">
        Campus {campus} · {todayIso} · repository: <strong>{repo.name}</strong>
      </p>

      {loadError ? (
        <p role="alert" className="text-red-700">
          Could not load items: {loadError}
        </p>
      ) : items.length === 0 ? (
        <p className="text-gray-600">No items saved today yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((b) => (
            <li key={b.id} className="rounded border border-gray-300 p-3">
              <p className="font-medium">
                {b.quantity} {b.unit} · {b.name}
                {b.brand ? ` · ${b.brand}` : ""}
              </p>
              <p className="text-sm text-gray-600">
                {b.category}
                {b.expires_on ? ` · expires ${b.expires_on}` : " · No date"}
                {b.arrived_expired ? " · arrived expired" : ""}
              </p>
              {b.edited_fields.length > 0 ? (
                <p className="text-xs text-gray-500">edited: {b.edited_fields.join(", ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
