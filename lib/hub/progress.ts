import { buildJourneyState } from "./content";
import { getHubMemberProfile, listMemberProgress } from "./member-profiles";
import type { HubProgressItem, HubProgressResponse } from "./types";

function withDerivedItem(
  items: HubProgressItem[],
  trackId: string,
  taskId: string,
  completedAt: string | null
) {
  if (!completedAt) {
    return items;
  }

  const existing = items.find(
    (item) => item.trackId === trackId && item.taskId === taskId
  );

  if (existing) {
    return items;
  }

  return [
    ...items,
    {
      id: `${trackId}:${taskId}:derived`,
      trackId,
      taskId,
      completedAt,
    },
  ];
}

export async function getHubProgressResponse(
  userId: string,
  defaults?: { name?: string | null; image?: string | null }
): Promise<HubProgressResponse> {
  const [profile, storedItems] = await Promise.all([
    getHubMemberProfile(userId, defaults),
    listMemberProgress(userId),
  ]);

  let items = [...storedItems];
  items = withDerivedItem(
    items,
    "foundation",
    "finish-onboarding",
    profile.onboardingCompletedAt
  );
  items = withDerivedItem(
    items,
    "foundation",
    "seed-brain",
    profile.notebooklmNotebookId ? profile.updatedAt : null
  );
  items = withDerivedItem(
    items,
    "foundation",
    "define-goal",
    profile.firstGoal ? profile.updatedAt : null
  );
  items = withDerivedItem(
    items,
    "creation",
    "share-link",
    profile.whopAffiliateId ? profile.updatedAt : null
  );
  items = withDerivedItem(
    items,
    "builder",
    "unlock-builder",
    profile.level >= 3 ? profile.updatedAt : null
  );

  const tracks = buildJourneyState(profile.level, items);
  const completedTasks = tracks.reduce(
    (sum, track) => sum + track.completedTasks,
    0
  );
  const totalTasks = tracks.reduce((sum, track) => sum + track.totalTasks, 0);

  return {
    items,
    tracks,
    completedTasks,
    totalTasks,
  };
}
