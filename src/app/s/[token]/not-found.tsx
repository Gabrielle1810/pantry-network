// Shown (with HTTP 404) for a wrong student link. No inventory, no hints about
// which campuses exist.
export default function StudentLinkNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">This link doesn&apos;t work</h1>
      <p className="text-muted">Please scan the QR poster at the pantry again.</p>
    </main>
  );
}
