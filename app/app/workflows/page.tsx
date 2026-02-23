"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api-client";

export default function AppWorkflowsPage() {
  const router = useRouter();

  useEffect(() => {
    const redirectToWorkflow = async () => {
      try {
        const workflows = await api.workflow.getAll();
        const filtered = workflows.filter(
          (workflow) => workflow.name !== "__current__"
        );

        if (filtered.length > 0) {
          const mostRecent = filtered.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0];
          router.replace(`/app/workflows/${mostRecent.id}`);
          return;
        }

        router.replace("/app/workflows/new");
      } catch (error) {
        console.error("Failed to load workflows:", error);
        router.replace("/app/workflows/new");
      }
    };

    redirectToWorkflow();
  }, [router]);

  return null;
}
