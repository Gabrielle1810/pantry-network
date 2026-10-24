import { redirect } from "next/navigation";

// R1.4: the root path redirects to the intake entry point.
export default function Home() {
  redirect("/intake");
}
