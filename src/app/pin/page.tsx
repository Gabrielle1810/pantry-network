"use client";

// Placeholder PIN gate (R2.1). Thin UI only: it posts the PIN to
// /api/session and, on success, navigates to /intake. All auth logic lives in
// src/lib/auth and the route handler (R1.3, R9.5). Deleting this file leaves
// every src/lib test green.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push("/intake");
        router.refresh();
        return;
      }
      setError("That PIN didn't work. Try again.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold">Pantry Network</h1>
      <p className="text-gray-600">Enter the staff PIN to start intake.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="pin" className="font-medium">
          Staff PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="rounded border border-gray-400 p-3 text-lg"
          aria-describedby={error ? "pin-error" : undefined}
        />
        {error ? (
          <p id="pin-error" role="alert" className="text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || pin.length === 0}
          className="rounded bg-gray-900 p-3 text-lg font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
