import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pantry Network — Intake",
  description:
    "Phone-first intake for university food pantries: photograph an item, the AI reads the label, staff confirm, and it is saved as an inventory batch.",
};

// Phone-first: lock to device width so pages render correctly on a 390 px
// viewport (R1.2) without desktop zoom-out.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="mx-auto min-h-dvh max-w-md bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
