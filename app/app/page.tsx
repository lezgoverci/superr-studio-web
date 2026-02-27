import { AIAgentFullPage } from "@/components/ai-agent/ai-agent-full-page";
import { Suspense } from "react";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-full w-full bg-background" />}>
      <AIAgentFullPage />
    </Suspense>
  );
}
