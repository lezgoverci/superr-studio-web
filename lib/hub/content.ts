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
  MemberRole,
  MemberSkillLevel,
} from "./types";

export const LEVEL_LABELS: Record<MemberLevel, string> = {
  1: "F-Class",
  2: "E-Class",
  3: "D-Class",
  4: "C-Class",
  5: "B-Class",
  6: "A-Class",
  7: "S-Class",
};

export const ROLE_OPTIONS = [
  "BPO / Support",
  "Virtual Assistant",
  "Freelancer",
  "Career Shifter",
  "Creator",
  "Marketer",
  "Operator",
  "Founder",
  "Student",
] as const;

export const MEMBER_ROLE_DETAILS: Array<{
  value: MemberRole;
  label: string;
  title: string;
  description: string;
}> = [
  {
    value: "hero",
    label: "Hero",
    title: "Leader & Strategist",
    description:
      "You like setting direction, organizing people, and keeping momentum clear.",
  },
  {
    value: "mage",
    label: "Mage",
    title: "Creator & Storyteller",
    description:
      "You turn ideas into content, explanations, and shareable stories.",
  },
  {
    value: "warrior",
    label: "Warrior",
    title: "Builder & Operator",
    description:
      "You enjoy systems, workflows, implementation, and making tools actually work.",
  },
  {
    value: "priest",
    label: "Priest",
    title: "Connector & Support",
    description:
      "You help people move, connect opportunities, and keep the team supported.",
  },
];

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
  { value: "medium", label: "Trying to rank up soon" },
  { value: "high", label: "Need momentum now" },
];

export const JOURNEY_TRACKS: HubJourneyTrack[] = [
  {
    id: "awakening",
    title: "Awakening",
    description:
      "Your eyes open. Find your path and prepare for the journey ahead.",
    tasks: [
      {
        trackId: "awakening",
        taskId: "finish-onboarding",
        title: "Finish onboarding",
        description: "Set your work type, skill level, and first goal.",
        href: "/app/welcome",
        minimumLevel: 1,
      },
      {
        trackId: "awakening",
        taskId: "seed-brain",
        title: "Seed your Brain",
        description:
          "Link your NotebookLM and add context from your real work.",
        href: "/app/brain",
        minimumLevel: 1,
      },
      {
        trackId: "awakening",
        taskId: "define-goal",
        title: "Lock your first sprint",
        description: "Write the one outcome you want this month.",
        href: "/app/me",
        minimumLevel: 1,
      },
    ],
  },
  {
    id: "forge",
    title: "Forge",
    description:
      "Turn your learning into visible power. Create, share, and begin to earn.",
    tasks: [
      {
        trackId: "forge",
        taskId: "share-link",
        title: "Set up your share link",
        description: "Start earning from the content and invites you publish.",
        href: "/app/earn",
        minimumLevel: 1,
      },
      {
        trackId: "forge",
        taskId: "publish-weekly",
        title: "Publish your weekly artifact",
        description: "Capture a result, lesson, or breakdown from your work.",
        href: "/app",
        minimumLevel: 3,
      },
    ],
  },
  {
    id: "command",
    title: "Command",
    description:
      "Architect systems. Wield the advanced tools. Shape the flow of the ecosystem.",
    tasks: [
      {
        trackId: "command",
        taskId: "unlock-command",
        title: "Reach Command access",
        description: "Rank up into the workflow and operations toolset.",
        href: "/app/studio",
        minimumLevel: 5,
      },
      {
        trackId: "command",
        taskId: "launch-workflow",
        title: "Launch your first workflow",
        description: "Build or adapt an automation you can actually reuse.",
        href: "/app/workflows/new",
        minimumLevel: 5,
      },
    ],
  },
];

function createTemplateSource(
  id: string,
  title: string,
  description: string,
  lines: string[]
): HubStarterSource {
  return {
    id,
    title,
    description,
    type: "text",
    value: lines.join("\n"),
  };
}

function createRoleTemplateSources(
  profile: HubMemberProfile
): HubStarterSource[] {
  const roleText = `${profile.currentRole ?? ""} ${profile.targetRole ?? ""}`
    .toLowerCase()
    .trim();

  if (/bpo|support|customer|call center|csr|qa|service/.test(roleText)) {
    return [
      createTemplateSource(
        "support-workflows",
        "Support AI Starter",
        "A guided starting point for customer support and QA work.",
        [
          "Focus first on:",
          "- Summarizing tickets and calls",
          "- Drafting replies with a human review step",
          "- Building QA checklists for recurring tasks",
          "",
          "Questions to answer in this notebook:",
          "- Which tasks repeat every day?",
          "- Where do you lose time or accuracy?",
          "- Which support workflows could AI assist safely?",
        ]
      ),
    ];
  }

  if (/virtual assistant|va|executive assistant|assistant/.test(roleText)) {
    return [
      createTemplateSource(
        "va-workflows",
        "VA AI Starter",
        "A starter prompt set for assistants and operations support work.",
        [
          "Focus first on:",
          "- Inbox triage and drafting",
          "- Research summaries",
          "- SOP capture and checklist creation",
          "",
          "Capture here:",
          "- Repeating admin tasks",
          "- The best prompts you discover",
          "- Templates that make your work faster each week",
        ]
      ),
    ];
  }

  if (/freelancer|client|consultant|agency/.test(roleText)) {
    return [
      createTemplateSource(
        "freelancer-playbook",
        "Freelancer Growth Starter",
        "A client-facing notebook outline for offers, delivery, and positioning.",
        [
          "Focus first on:",
          "- Proposal and pitch improvements",
          "- Faster research and delivery workflows",
          "- Portfolio proof and case study notes",
          "",
          "Capture here:",
          "- Your strongest results",
          "- Common client requests",
          "- Processes you can turn into repeatable systems",
        ]
      ),
    ];
  }

  if (/career shifter|student|new|learning|upskill/.test(roleText)) {
    return [
      createTemplateSource(
        "career-shift-map",
        "Career Shift Starter",
        "A guided map for members building confidence and direction.",
        [
          "Focus first on:",
          "- Clarifying the kind of work you want next",
          "- Building proof of learning in public",
          "- Turning notes into visible artifacts",
          "",
          "Capture here:",
          "- Skills you want to build",
          "- What you are curious about",
          "- Small wins that show momentum",
        ]
      ),
    ];
  }

  return [
    createTemplateSource(
      "general-workflow-map",
      "General Brain Starter",
      "A flexible starting structure for members shaping their next move.",
      [
        "Focus first on:",
        "- Saving useful resources from your real work",
        "- Turning repeated tasks into simple playbooks",
        "- Tracking what you learn each week",
        "",
        "Capture here:",
        "- Your best resources",
        "- Problems worth solving with AI",
        "- Questions you want the platform to help answer",
      ]
    ),
  ];
}

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
      `Current rank: ${levelLabel}`,
      `Next focus: ${profile.level >= 5 ? "Ship systems and reusable assets." : "Build visible reps and a consistent learning loop."}`,
      "Use the Brain to collect context, the Quest Log to track progress, and Earn to distribute what you make.",
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
      "- Review your quests every time you finish a sprint.",
    ].join("\n"),
  };
}

export function getStarterSources(
  profile: HubMemberProfile
): HubStarterSource[] {
  return [
    createBriefSource(profile),
    createPathSource(profile),
    createFirstSprintSource(profile),
    ...createRoleTemplateSources(profile),
  ];
}

type RoleRecommendationProfile = Pick<
  HubMemberProfile,
  "currentRole" | "targetRole" | "firstGoal" | "aiFamiliarity"
>;

export function getRecommendedMemberRole(
  profile: RoleRecommendationProfile
): MemberRole {
  const text = [profile.currentRole, profile.targetRole, profile.firstGoal]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /creator|content|story|social|write|brand|marketing|video|design/.test(text)
  ) {
    return "mage";
  }

  if (
    /build|engineer|developer|automation|workflow|operator|ops|system|tech/.test(
      text
    )
  ) {
    return "warrior";
  }

  if (
    /community|connect|network|sales|support|care|relationship|recruit/.test(
      text
    )
  ) {
    return "priest";
  }

  if (/founder|lead|manager|project|strategy|team/.test(text)) {
    return "hero";
  }

  if (profile.aiFamiliarity === "power-user") {
    return "warrior";
  }

  return "hero";
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

const F_TO_E_CRITERIA: LevelCriterionSpec[] = [
  {
    id: "onboarding-done",
    label: "Complete onboarding",
    check: (ctx) => Boolean(ctx.profile.onboardingCompletedAt),
  },
  {
    id: "awakening-track",
    label: "Finish all Awakening quests",
    check: (ctx) => isTrackComplete(ctx.tracks, "awakening"),
  },
];

const E_TO_D_CRITERIA: LevelCriterionSpec[] = [
  {
    id: "forge-track",
    label: "Finish all Forge quests",
    check: (ctx) => isTrackComplete(ctx.tracks, "forge"),
  },
  {
    id: "brain-provisioned",
    label: "Link your Brain",
    check: (ctx) => Boolean(ctx.profile.notebooklmNotebookId),
  },
  {
    id: "affiliate-active",
    label: "Activate your share link",
    check: (ctx) => Boolean(ctx.profile.whopAffiliateId),
  },
];

const D_TO_C_CRITERIA: LevelCriterionSpec[] = [
  {
    id: "command-track",
    label: "Finish all Command quests",
    check: (ctx) => isTrackComplete(ctx.tracks, "command"),
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
      return F_TO_E_CRITERIA;
    case 2:
      return E_TO_D_CRITERIA;
    case 3:
      return D_TO_C_CRITERIA;
    default:
      return [];
  }
}

export function checkLevelUp(ctx: LevelCheckContext): HubLevelCheckResponse {
  const currentLevel = ctx.profile.level;

  if (currentLevel >= 7) {
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
