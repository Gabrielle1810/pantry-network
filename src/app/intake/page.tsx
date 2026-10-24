// Placeholder intake entry point. The real capture + review UI is built in
// Task 12; this stub exists so `/` has a redirect target (R1.4) and the
// phone-first base layout renders. All behavior will live in src/lib (R1.3).
export default function IntakePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Pantry Network — Intake</h1>
      <p className="text-gray-600">
        Scaffold ready. Capture and review are coming in a later task.
      </p>
    </main>
  );
}
