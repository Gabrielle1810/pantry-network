import { redirect } from "next/navigation";

// The old intake entry point now lives at Add stock.
export default function IntakePage() {
  redirect("/add");
}
