import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// Figtree is the app font (PL.1). Exposed as a CSS variable consumed by the
// --font-sans theme token in globals.css.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pantry Network",
  description:
    "A shared inventory for Massachusetts campus food pantries. Sample data.",
};

// Works on a 390 px phone (student page, Add stock camera) and desktop (manager
// pages own their own width). Root stays full-width; pages add their layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-dvh bg-app font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
