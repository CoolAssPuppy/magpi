import { redirect } from "next/navigation";

/** Pages and the dashboard are one screen now. */
export default function PagesPage() {
  redirect("/dashboard");
}
