"use client";

import { useAtomValue } from "jotai";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { resolveAiAgentPageContext } from "@/lib/ai-agent/page-context/resolve";
import { aiAgentPageContextDetailsAtom } from "@/lib/ai-agent/page-context/store";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";

export function useAiAgentPageContext(): AiAgentContextEnvelope {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const details = useAtomValue(aiAgentPageContextDetailsAtom);

  return useMemo(() => {
    const normalizedPathname = pathname || "/app";
    const normalizedSearchParams = searchParams
      ? new URLSearchParams(searchParams.toString())
      : null;

    return resolveAiAgentPageContext({
      pathname: normalizedPathname,
      searchParams: normalizedSearchParams,
      details,
    });
  }, [details, pathname, searchParams]);
}
