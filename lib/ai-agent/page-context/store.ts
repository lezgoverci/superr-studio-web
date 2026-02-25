import { atom } from "jotai";
import type { AiAgentPageContextDetails } from "@/lib/ai-agent/page-context/types";

export const aiAgentPageContextDetailsAtom =
  atom<AiAgentPageContextDetails | null>(null);

export const setAiAgentPageContextDetailsAtom = atom(
  null,
  (_get, set, details: AiAgentPageContextDetails) => {
    set(aiAgentPageContextDetailsAtom, details);
  }
);

export const clearAiAgentPageContextDetailsAtom = atom(null, (_get, set) => {
  set(aiAgentPageContextDetailsAtom, null);
});
