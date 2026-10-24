import { redirect } from "next/navigation";

// Saves now land in products + item_batches; Inventory shows them.
export default function TodayPage() {
  redirect("/inventory");
}
