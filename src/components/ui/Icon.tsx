"use client";

// Thin wrapper over lucide-react that renders an icon by its kebab-case name
// (the same names the prototype + category-meta use), so data can carry icon
// strings. Falls back to a package icon for unknown names.
import { icons, Package, type LucideProps } from "lucide-react";

function toPascal(name: string): string {
  return name
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (icons as Record<string, React.ComponentType<LucideProps>>)[toPascal(name)] ?? Package;
  return <Cmp aria-hidden {...props} />;
}
