"use client";

// DEBUG page, not linked from the navigation. Photographs an item, runs
// /api/vision/read-label and shows the raw read, then can Save to /api/items,
// so the vision call and persistence can be checked on their own. Staff use
// Add stock (/add). All logic stays in src/lib. Behind the staff PIN (the
// proxy guards /intake/*).
import { useState } from "react";
import { prepareImage, type PreparedImage } from "@/lib/image";
import type { LabelRead } from "@/lib/vision";
import { resolveUnit, pluralizeUnit } from "@/lib/items/units";

interface ReadResponse {
  status: "ok" | "unreadable";
  provider: string;
  read?: LabelRead;
}

interface SaveResponse {
  batch?: { id: string; name: string; quantity: number; unit: string; received_on: string };
  totals?: { before: number; added: number; after: number; firstBatch: boolean };
  repository?: string;
  error?: string;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function VisionTestPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<PreparedImage | null>(null);
  const [result, setResult] = useState<ReadResponse | null>(null);

  // Editable draft fields (so corrections + totals can be exercised).
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("Uncategorized");
  const [quantity, setQuantity] = useState(1);
  // Generated lazily in event handlers (never during render — crypto.randomUUID
  // at prerender is flagged under cacheComponents).
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResponse | null>(null);

  const read = result?.read;

  // Prefill the editable fields from a read (called from the fetch handler, not
  // an effect, to avoid cascading-render setState-in-effect).
  function prefillFrom(r: LabelRead | undefined) {
    setName(r?.name ?? "");
    setBrand(r?.brand ?? "");
    setCategory(r?.category ?? "Uncategorized");
    setQuantity(r?.quantity_visible ?? 1);
    setIdempotencyKey(uuid());
    setSaveResult(null);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPrep(null);
    setSaveResult(null);
    try {
      const prepared = await prepareImage(file);
      setPrep(prepared);
      const res = await fetch("/api/vision/read-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: prepared.base64 }),
      });
      const json = (await res.json()) as ReadResponse;
      setResult(json);
      prefillFrom(json.read);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    const key = idempotencyKey || uuid();
    if (!idempotencyKey) setIdempotencyKey(key);
    try {
      // Which product fields did staff change vs the read?
      const editedFields: string[] = [];
      if (read) {
        if ((read.name ?? "") !== name) editedFields.push("name");
        if ((read.brand ?? "") !== brand) editedFields.push("brand");
        if ((read.category ?? "") !== category) editedFields.push("category");
        if ((read.quantity_visible ?? 1) !== quantity) editedFields.push("quantity");
      }
      const unit = resolveUnit(read?.container ?? null, category);
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: key,
          batch: {
            name,
            brand: brand || null,
            size_text: read?.size_text ?? null,
            category,
            category_group: null,
            quantity,
            unit,
            expires_on: read?.expires_on ?? null,
            date_type: read?.date_type ?? null,
            date_precision: read?.date_precision ?? null,
            date_source: read?.expires_on ? "photo" : null,
            dont_track: false,
            doesnt_expire: read?.doesnt_expire ?? false,
            perishable: read?.perishable ?? false,
            source: null,
          },
          read: read
            ? {
                name: read.name,
                brand: read.brand,
                category: read.category,
                date_raw: read.date_raw,
                expires_on: read.expires_on,
                name_confidence: read.name_confidence,
                date_confidence: read.date_confidence,
              }
            : null,
          editedFields,
        }),
      });
      const json = (await res.json()) as SaveResponse;
      setSaveResult(json);
    } catch (err) {
      setSaveResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  const unit = resolveUnit(read?.container ?? null, category);
  const saveLabel = `Save ${quantity} ${pluralizeUnit(unit, quantity)}`;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Vision + save test</h1>
      <p className="text-gray-600">
        Show the item&apos;s name and the date on its label.
      </p>

      <label htmlFor="photo" className="font-medium">
        Take a photo
      </label>
      <input
        id="photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        disabled={busy}
      />

      {busy ? <p role="status">Reading…</p> : null}
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}

      {prep ? (
        <p className="text-sm text-gray-600">
          Prepared: {prep.width}×{prep.height}px, {(prep.bytes / 1024).toFixed(0)} KB
        </p>
      ) : null}

      {result ? (
        <section className="flex flex-col gap-3">
          <p>
            <strong>status:</strong> {result.status} &nbsp;
            <strong>provider:</strong> {result.provider}
            {result.provider === "mock" ? " (Demo mode: sample reads)" : ""}
          </p>

          <fieldset className="flex flex-col gap-2 rounded border border-gray-300 p-3">
            <legend className="font-medium">Edit &amp; save</legend>
            <label className="flex flex-col text-sm">
              Name
              <input
                className="rounded border border-gray-400 p-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm">
              Brand
              <input
                className="rounded border border-gray-400 p-2"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm">
              Category
              <input
                className="rounded border border-gray-400 p-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm">
              Quantity
              <input
                type="number"
                min={1}
                max={999}
                className="w-24 rounded border border-gray-400 p-2"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
              />
            </label>
            <p className="text-xs text-gray-600">
              expires_on: {read?.expires_on ?? "— (will save as No date)"}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || name.trim().length === 0}
              className="min-h-11 rounded bg-gray-900 p-3 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : saveLabel}
            </button>
          </fieldset>

          {saveResult ? (
            <section className="rounded border border-green-700 p-3 text-sm">
              {saveResult.error ? (
                <p className="text-red-700" role="alert">
                  Save error: {saveResult.error}
                </p>
              ) : (
                <>
                  <p>
                    <strong>Saved.</strong> repository: {saveResult.repository}
                  </p>
                  {saveResult.totals ? (
                    <p>
                      {saveResult.totals.firstBatch
                        ? `${saveResult.totals.added} added`
                        : `${saveResult.totals.before} on the shelf + ${saveResult.totals.added} added = ${saveResult.totals.after}`}
                    </p>
                  ) : null}
                  <p className="mt-1">
                    <a className="inline-flex min-h-11 items-center text-green-700 underline" href="/inventory">
                      Open Inventory
                    </a>
                  </p>
                </>
              )}
            </section>
          ) : null}

          <details>
            <summary className="cursor-pointer font-medium">Raw read JSON</summary>
            <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}
