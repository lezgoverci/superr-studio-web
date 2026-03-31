import type {
  HubJourneyTaskState,
  HubJourneyTrack,
  HubJourneyTrackState,
  HubLevelCheckResponse,
  HubLevelCriterion,
  HubMemberProfile,
  HubProgressItem,
  HubStarterSource,
  MemberAiFamiliarity,
  MemberCareerPressure,
  MemberLevel,
  MemberSkillLevel,
} from "./types";

export const LEVEL_LABELS: Record<MemberLevel, string> = {
  1: "Explorer",
  2: "Creator",
  3: "Shadow Operator",
  4: "Founder",
};

export const ROLE_OPTIONS = [
  "Student",
  "Freelancer",
  "Operator",
  "Marketer",
  "Creator",
  "Founder",
  "Team Lead",
] as const;

export const SKILL_LEVEL_OPTIONS: Array<{
  value: MemberSkillLevel;
  label: string;
}> = [
  { value: "starting", label: "Starting out" },
  { value: "developing", label: "Developing" },
  { value: "advanced", label: "Advanced" },
];

export const AI_FAMILIARITY_OPTIONS: Array<{
  value: MemberAiFamiliarity;
  label: string;
}> = [
  { value: "new", label: "Brand new to AI" },
  { value: "comfortable", label: "Comfortable with AI tools" },
  { value: "power-user", label: "Power user" },
];

export const CAREER_PRESSURE_OPTIONS: Array<{
  value: MemberCareerPressure;
  label: string;
}> = [
  { value: "low", label: "Exploring without pressure" },
  { value: "medium", label: "Trying to level up soon" },
  { value: "high", label: "Need momentum now" },
];

export const JOURNEY_TRACKS: HubJourneyTrack[] = [
  {
    id: "foundation",
    title: "Foundation",
    description: "Get clear on your direction and train your daily workflow.",
    tasks: [
      {
        trackId: "foundation",
        taskId: "finish-onboarding",
        title: "Finish onboarding",
        description: "Set your role, skill level, and first goal.",
        href: "/app/welcome",
        minimumLevel: 1,
      },
      {
        trackId: "foundation",
        taskId: "seed-brain",
        title: "Seed your Brain",
        description: "Add context so your workspace reflects your real work.",
        href: "/app/brain",
        minimumLevel: 1,
      },
      {
        trackId: "foundation",
        taskId: "define-goal",
        title: "Lock your first sprint",
        description: "Write the one outcome you want this month.",
        href: "/app/me",
        minimumLevel: 1,
      },
    ],
  },
  {
    id: "creation",
    title: "Creation",
    description: "Turn your learning into visible output and distribution.",
    tasks: [
      {
        trackId: "creation",
        taskId: "share-link",
        title: "Set up your share link",
        description: "Start earning from the content and invites you publish.",
        href: "/app/earn",
        minimumLevel: 1,
      },
      {
        trackId: "creation",
        taskId: "publish-weekly",
        title: "Publish your weekly artifact",
        description: "Capture a result, lesson, or breakdown from your work.",
        href: "/app",
        minimumLevel: 2,
      },
    ],
  },
  {
    id: "builder",
    title: "Builder",
    description: "Graduate into campaign systems and advanced tooling.",
    tasks: [
      {
        trackId: "builder",
        taskId: "unlock-builder",
        title: "Reach Builder access",
        description: "Level up into the workflow and operations toolset.",
        href: "/app/studio",
        minimumLevel: 3,
      },
      {
        trackId: "builder",
        taskId: "launch-workflow",
        title: "Launch your first workflow",
        description: "Build or adapt an automation you can actually reuse.",
        href: "/app/workflows/new",
        minimumLevel: 3,
      },
    ],
  },
];

function createBriefSource(profile: HubMemberProfile): HubStarterSource {
  const lines = [
    `Current role: ${profile.currentRole ?? "Undeclared"}`,
    `Target role: ${profile.targetRole ?? "Undeclared"}`,
    `Skill level: ${profile.skillLevel ?? "Unknown"}`,
    `AI familiarity: ${profile.aiFamiliarity ?? "Unknown"}`,
    `Career pressure: ${profile.careerPressure ?? "Unknown"}`,
    `First goal: ${profile.firstGoal ?? "Not set yet"}`,
  ];

  return {
    id: "member-brief",
    title: "Member Brief",
    description: "A structured snapshot of the member's current stage.",
    type: "text",
    value: lines.join("\n"),
  };
}

function createPathSource(profile: HubMemberProfile): HubStarterSource {
  const levelLabel = LEVEL_LABELS[profile.level];

  return {
    id: "journey-path",
    title: "Journey Path",
    description: "A short guide for what to focus on next inside the Hub.",
    type: "text",
    value: [
      `Current level: ${levelLabel}`,
      `Next focus: ${profile.level >= 3 ? "Ship systems and reusable assets." : "Build visible reps and a consistent learning loop."}`,
      "Use the Brain to collect context, the Journey to track progress, and Earn to distribute what you make.",
    ].join("\n\n"),
  };
}

function createFirstSprintSource(profile: HubMemberProfile): HubStarterSource {
  return {
    id: "first-sprint",
    title: "First Sprint Plan",
    description: "A plain-language brief for the member's first sprint.",
    type: "text",
    value: [
      `Primary goal: ${profile.firstGoal ?? "Clarify a first measurable goal."}`,
      `Constraint level: ${profile.careerPressure ?? "unknown"}`,
      "Sprint rhythm:",
      "- Add new context to Brain when you learn something useful.",
      "- Publish one artifact or insight each week.",
      "- Review your Journey tasks every time you finish a sprint.",
    ].join("\n"),
  };
}

export function getStarterSources(profile: HubMemberProfile): HubStarterSource[] {
  return [
    createBriefSource(profile),
    createPathSource(profile),
    createFirstSprintSource(profile),
  ];
}

export function buildJourneyState(
  level: MemberLevel,
  progressItems: HubProgressItem[]
): HubJourneyTrackState[] {
  const completedByTask = new Map(
    progressItems.map((item) => [`${item.trackId}:${item.taskId}`, item])
  );

  return JOURNEY_TRACKS.map((track) => {
    const tasks: HubJourneyTaskState[] = track.tasks.map((task) => {
      const progress = completedByTask.get(`${task.trackId}:${task.taskId}`);
      const isAvailable = task.minimumLevel <= level;

      return {
        ...task,
        completedAt: progress?.completedAt ?? null,
        isCompleted: Boolean(progress?.completedAt),
        isAvailable,
      };
    });

    const completedTasks = tasks.filter((task) => task.isCompleted).length;

    return {
      id: track.id,
      title: track.title,
      description: track.description,
      completedTasks,
      totalTasks: tasks.length,
      tasks,
    };
  });
}

type LevelCriterionSpec = {
  id: string;
  label: string;
  check: (ctx: LevelCheckContext) => boolean;
};

type LevelCheckContext = {
  profile: HubMemberProfile;
  tracks: HubJourneyTrackState[];
  workflowCount: number;
};

function isTrackComplete(tracks: HubJourneyTrackState[], trackId: string) {
  const track = tracks.find((t) => t.id === trackId);
  return track ? track.completedTasks >= track.totalTasks : false;
}

const L1_TO_L2_CRITERIA: LevelCriterionSpec[] = [
  {
    id: "onboarding-done",
    label: "Complete onboarding",
    check: (ctx) => Boolean(ctx.profile.onboardingCompletedAt),
  },
  {
    id: "foundation-track",
    label: "Finish all Foundation tasks",
    check: (ctx) => isTrackComplete(ctx.tracks, "foundation"),
  },
];

const L2_TO_L3_CRITERIA: LevelCriterionSpec[] = [
  {
    id: "creation-track",
    label: "Finish all Creation tasks",
    check: (ctx) => isTrackComplete(ctx.tracks, "creation"),
  },
  {
    id: "brain-provisioned",
    label: "Provision your Brain",
    check: (ctx) => Boolean(ctx.profile.notebooklmNotebookId),
  },
  {
    id: "affiliate-active",
    label: "Activate your share link",
    check: (ctx) => Boolean(ctx.profile.whopAffiliateId),
  },
];

const L3_TO_L4_CRITERIA: LevelCriterionSpec[] = [
  {
    id: "builder-track",
    label: "Finish all Builder tasks",
    check: (ctx) => isTrackComplete(ctx.tracks, "builder"),
  },
  {
    id: "workflow-created",
    label: "Create at least one workflow",
    check: (ctx) => ctx.workflowCount > 0,
  },
];

function getCriteriaForLevel(level: MemberLevel): LevelCriterionSpec[] {
  switch (level) {
    case 1:
      return L1_TO_L2_CRITERIA;
    case 2:
      return L2_TO_L3_CRITERIA;
    case 3:
      return L3_TO_L4_CRITERIA;
    default:
      return [];
  }
}

export function checkLevelUp(ctx: LevelCheckContext): HubLevelCheckResponse {
  const currentLevel = ctx.profile.level;

  if (currentLevel >= 4) {
    return {
      currentLevel,
      eligible: false,
      nextLevel: null,
      completedCriteria: [],
      remainingCriteria: [],
      leveledUp: false,
    };
  }

  const specs = getCriteriaForLevel(currentLevel);
  const completedCriteria: HubLevelCriterion[] = [];
  const remainingCriteria: HubLevelCriterion[] = [];

  for (const spec of specs) {
    const criterion: HubLevelCriterion = {
      id: spec.id,
      label: spec.label,
      completed: spec.check(ctx),
    };

    if (criterion.completed) {
      completedCriteria.push(criterion);
    } else {
      remainingCriteria.push(criterion);
    }
  }

  const eligible = remainingCriteria.length === 0;
  const nextLevel = (currentLevel + 1) as MemberLevel;

  return {
    currentLevel,
    eligible,
    nextLevel: eligible ? nextLevel : nextLevel,
    completedCriteria,
    remainingCriteria,
    leveledUp: false,
  };
}
