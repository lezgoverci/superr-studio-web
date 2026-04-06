export const MEMBER_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
export type MemberLevel = (typeof MEMBER_LEVELS)[number];

export const MEMBER_ROLES = ["hero", "mage", "warrior", "priest"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_SKILL_LEVELS = [
  "starting",
  "developing",
  "advanced",
] as const;
export type MemberSkillLevel = (typeof MEMBER_SKILL_LEVELS)[number];

export const MEMBER_AI_FAMILIARITY = [
  "new",
  "comfortable",
  "power-user",
] as const;
export type MemberAiFamiliarity = (typeof MEMBER_AI_FAMILIARITY)[number];

export const MEMBER_CAREER_PRESSURE = ["low", "medium", "high"] as const;
export type MemberCareerPressure = (typeof MEMBER_CAREER_PRESSURE)[number];

export type HubMemberProfile = {
  id: string;
  userId: string;
  level: MemberLevel;
  role: MemberRole | null;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  currentRole: string | null;
  targetRole: string | null;
  skillLevel: MemberSkillLevel | null;
  aiFamiliarity: MemberAiFamiliarity | null;
  careerPressure: MemberCareerPressure | null;
  firstGoal: string | null;
  whopAffiliateId: string | null;
  notebooklmNotebookId: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string | null;
  userImage: string | null;
  providerId: string | null;
};

export type HubStarterSource = {
  id: string;
  title: string;
  description: string;
  type: "url" | "text";
  value: string;
};

export type HubJourneyTask = {
  trackId: string;
  taskId: string;
  title: string;
  description: string;
  href: string;
  minimumLevel: MemberLevel;
};

export type HubJourneyTrack = {
  id: string;
  title: string;
  description: string;
  tasks: HubJourneyTask[];
};

export type HubProgressItem = {
  id: string;
  trackId: string;
  taskId: string;
  completedAt: string | null;
};

export type HubJourneyTaskState = HubJourneyTask & {
  completedAt: string | null;
  isCompleted: boolean;
  isAvailable: boolean;
};

export type HubJourneyTrackState = Omit<HubJourneyTrack, "tasks"> & {
  completedTasks: number;
  totalTasks: number;
  tasks: HubJourneyTaskState[];
};

export type HubProgressResponse = {
  items: HubProgressItem[];
  tracks: HubJourneyTrackState[];
  completedTasks: number;
  totalTasks: number;
};

export type HubBrainResponse = {
  configured: boolean;
  serviceMode: "external" | "stub";
  isLinked: boolean;
  serviceMessage: string | null;
  notebookId: string | null;
  notebookTitle: string | null;
  status: string;
  summary: string | null;
  sourceCount: number;
  starterSources: HubStarterSource[];
};

export type HubBrainSourceMutationResponse = {
  success: boolean;
  source: {
    id: string;
    title: string | null;
    type: string | null;
    url: string | null;
  } | null;
  brain: HubBrainResponse;
};

export type HubEarnResponse = {
  configured: boolean;
  affiliateId: string | null;
  username: string | null;
  shareLink: string | null;
  totals: {
    earningsUsd: number;
    revenueUsd: number;
    monthlyRecurringRevenueUsd: number;
    referrals: number;
    activeMembers: number;
  };
  message: string | null;
};

export type HubLevelCriterion = {
  id: string;
  label: string;
  completed: boolean;
};

export type HubLevelCheckResponse = {
  currentLevel: MemberLevel;
  eligible: boolean;
  nextLevel: MemberLevel | null;
  completedCriteria: HubLevelCriterion[];
  remainingCriteria: HubLevelCriterion[];
  leveledUp: boolean;
};

export function clampMemberLevel(
  value: number | null | undefined
): MemberLevel {
  if (value === 7) {
    return 7;
  }
  if (value === 6) {
    return 6;
  }
  if (value === 5) {
    return 5;
  }
  if (value === 4) {
    return 4;
  }
  if (value === 3) {
    return 3;
  }
  if (value === 2) {
    return 2;
  }
  return 1;
}

export function isMemberSkillLevel(
  value: string | null | undefined
): value is MemberSkillLevel {
  return MEMBER_SKILL_LEVELS.includes(value as MemberSkillLevel);
}

export function isMemberAiFamiliarity(
  value: string | null | undefined
): value is MemberAiFamiliarity {
  return MEMBER_AI_FAMILIARITY.includes(value as MemberAiFamiliarity);
}

export function isMemberCareerPressure(
  value: string | null | undefined
): value is MemberCareerPressure {
  return MEMBER_CAREER_PRESSURE.includes(value as MemberCareerPressure);
}

export function isMemberRole(
  value: string | null | undefined
): value is MemberRole {
  return MEMBER_ROLES.includes(value as MemberRole);
}
