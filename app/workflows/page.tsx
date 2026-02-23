import { redirect } from "next/navigation";

export default function LegacyWorkflowsPage() {
  redirect("/app/workflows");
}
