import { Suspense } from "react";
import { AIAgentFullPage } from "@/components/ai-agent/ai-agent-full-page";

export default function BuildNodePage() {
  return (
    <Suspense fallback={<div className="h-full w-full bg-background" />}>
      <AIAgentFullPage />
    </Suspense>
  );
}
