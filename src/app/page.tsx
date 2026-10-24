import { redirect } from "next/navigation";

// The manager home is Inventory (behind the PIN via middleware).
export default function Home() {
  redirect("/inventory");
}
