"use client";

// TEMPORARY recognition-test page. Lets you photograph an item on your phone,
// runs the browser image prep + /api/vision/read-label, and dumps the parsed
// fields plus the raw JSON so you can eyeball real Gemini reads. Not part of
// the final UI (Task 12 builds the real review flow); all logic stays in
// src/lib. Protected by the PIN gate via middleware (/intake/*).
import { useState } from "react";
import { prepareImage, type PreparedImage } from "@/lib/image";
import type { LabelRead } from "@/lib/vision";

interface ReadResponse {
  status: "ok" | "unreadable";
  provider: string;
  read?: LabelRead;
}

export default function VisionTestPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<PreparedImage | null>(null);
  const [result, setResult] = useState<ReadResponse | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPrep(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const read = result?.read;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Vision test</h1>
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
        <section className="flex flex-col gap-2">
          <p>
            <strong>status:</strong> {result.status} &nbsp;
            <strong>provider:</strong> {result.provider}
            {result.provider === "mock" ? " (Demo mode: sample reads)" : ""}
          </p>

          {read ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-medium">name</dt>
              <dd>{read.name ?? "—"}</dd>
              <dt className="font-medium">brand</dt>
              <dd>{read.brand ?? "—"}</dd>
              <dt className="font-medium">size</dt>
              <dd>{read.size_text ?? "—"}</dd>
              <dt className="font-medium">category</dt>
              <dd>{read.category}</dd>
              <dt className="font-medium">date_raw</dt>
              <dd>{read.date_raw ?? "—"}</dd>
              <dt className="font-medium">date_type</dt>
              <dd>{read.date_type}</dd>
              <dt className="font-medium">expires_on</dt>
              <dd>{read.expires_on ?? "—"}</dd>
              <dt className="font-medium">date_precision</dt>
              <dd>{read.date_precision ?? "—"}</dd>
              <dt className="font-medium">date_ambiguous</dt>
              <dd>{String(read.date_ambiguous)}</dd>
              <dt className="font-medium">date_candidates</dt>
              <dd>{read.date_candidates.join(", ") || "—"}</dd>
              <dt className="font-medium">name_confidence</dt>
              <dd>{read.name_confidence}</dd>
              <dt className="font-medium">date_confidence</dt>
              <dd>{read.date_confidence}</dd>
            </dl>
          ) : null}

          <details>
            <summary className="cursor-pointer font-medium">Raw JSON</summary>
            <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}
