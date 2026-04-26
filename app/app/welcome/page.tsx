"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { OnboardingShell } from "@/components/hub/onboarding-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import {
  AI_FAMILIARITY_OPTIONS,
  CAREER_PRESSURE_OPTIONS,
  ROLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
} from "@/lib/hub/content";
import type {
  MemberAiFamiliarity,
  MemberCareerPressure,
  MemberSkillLevel,
} from "@/lib/hub/types";
import { cn } from "@/lib/utils";

type PresetRole = (typeof ROLE_OPTIONS)[number];
type CurrentRoleSelectionState = {
  customCurrentRole: string;
  isCustomRole: boolean;
  selectedPresetRole: string;
};

type OnboardingErrors = {
  aiFamiliarity?: string;
  careerPressure?: string;
  currentRole?: string;
  firstGoal?: string;
  skillLevel?: string;
};

type OptionCardGroupProps = {
  description: string;
  error?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  selectedValue: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

type CurrentRoleFeedbackProps = {
  currentRoleRef: RefObject<HTMLInputElement | null>;
  customCurrentRole: string;
  error?: string;
  isCustomRole: boolean;
  onChange: (value: string) => void;
};

function getPillClassName(selected: boolean) {
  return cn(
    "h-auto rounded-full border px-4 py-2.5 text-sm shadow-none transition-colors",
    selected
      ? "border-primary text-primary ring-1 ring-primary"
      : "border-border/70 bg-background hover:bg-accent/40"
  );
}

function isPresetRole(value: string): value is PresetRole {
  return ROLE_OPTIONS.includes(value as PresetRole);
}

function resolveCurrentRoleSelection(
  currentRole: string | null | undefined
): CurrentRoleSelectionState {
  const incomingCurrentRole = currentRole || "";

  if (isPresetRole(incomingCurrentRole)) {
    return {
      customCurrentRole: "",
      isCustomRole: false,
      selectedPresetRole: incomingCurrentRole,
    };
  }

  return {
    customCurrentRole: incomingCurrentRole,
    isCustomRole: Boolean(incomingCurrentRole),
    selectedPresetRole: "",
  };
}

function OptionCardGroup({
  description,
  error,
  id,
  label,
  onChange,
  options,
  selectedValue,
  triggerRef,
}: OptionCardGroupProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex flex-wrap gap-3 sm:gap-4">
        {options.map((option, index) => {
          const selected = selectedValue === option.value;

          return (
            <Button
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={Boolean(error)}
              aria-pressed={selected}
              className={getPillClassName(selected)}
              key={option.value}
              onClick={() => onChange(option.value)}
              ref={index === 0 ? triggerRef : undefined}
              type="button"
              variant="outline"
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      {error ? (
        <p className="text-destructive text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CurrentRoleFeedback({
  currentRoleRef,
  customCurrentRole,
  error,
  isCustomRole,
  onChange,
}: CurrentRoleFeedbackProps) {
  if (isCustomRole) {
    return (
      <div className="space-y-2.5 rounded-2xl border border-border/80 border-dashed bg-muted/20 p-4">
        <Label htmlFor="currentRole">Custom Work Type</Label>
        <Input
          aria-describedby={error ? "current-role-error" : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          id="currentRole"
          name="currentRole"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your work type in your own words..."
          ref={currentRoleRef}
          value={customCurrentRole}
        />
        {error ? (
          <p className="text-destructive text-sm" id="current-role-error">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Use this only if the quick picks do not describe your work.
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive text-sm" id="current-role-error">
        {error}
      </p>
    );
  }

  return null;
}

export default function WelcomePage() {
  const router = useRouter();
  const { memberProfile, setMemberProfile } = useAppShellContext();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<OnboardingErrors>({});

  const [displayName, setDisplayName] = useState(
    memberProfile?.displayName || ""
  );
  const [selectedPresetRole, setSelectedPresetRole] = useState("");
  const [customCurrentRole, setCustomCurrentRole] = useState("");
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [skillLevel, setSkillLevel] = useState(memberProfile?.skillLevel || "");
  const [aiFamiliarity, setAiFamiliarity] = useState(
    memberProfile?.aiFamiliarity || ""
  );
  const [careerPressure, setCareerPressure] = useState(
    memberProfile?.careerPressure || ""
  );
  const [firstGoal, setFirstGoal] = useState(memberProfile?.firstGoal || "");

  const currentRoleRef = useRef<HTMLInputElement>(null);
  const currentRoleOptionRef = useRef<HTMLButtonElement>(null);
  const skillLevelRef = useRef<HTMLButtonElement>(null);
  const aiFamiliarityRef = useRef<HTMLButtonElement>(null);
  const careerPressureRef = useRef<HTMLButtonElement>(null);
  const firstGoalRef = useRef<HTMLTextAreaElement>(null);

  const isEditingAnswers = Boolean(
    memberProfile?.onboardingCompletedAt && !memberProfile?.role
  );
  const resolvedCurrentRole = isCustomRole
    ? customCurrentRole.trim()
    : selectedPresetRole;

  useEffect(() => {
    if (!memberProfile) {
      return;
    }
    const nextCurrentRoleSelection = resolveCurrentRoleSelection(
      memberProfile.currentRole
    );

    setDisplayName(memberProfile.displayName || memberProfile.userName || "");
    setSelectedPresetRole(nextCurrentRoleSelection.selectedPresetRole);
    setCustomCurrentRole(nextCurrentRoleSelection.customCurrentRole);
    setIsCustomRole(nextCurrentRoleSelection.isCustomRole);
    setSkillLevel(memberProfile.skillLevel || "");
    setAiFamiliarity(memberProfile.aiFamiliarity || "");
    setCareerPressure(memberProfile.careerPressure || "");
    setFirstGoal(memberProfile.firstGoal || "");
  }, [memberProfile]);

  const validateForm = () => {
    const nextErrors: OnboardingErrors = {};
    let firstInvalid: HTMLElement | null = null;

    if (!resolvedCurrentRole) {
      nextErrors.currentRole = "Choose or type your current work type.";
      firstInvalid = isCustomRole
        ? currentRoleRef.current
        : currentRoleOptionRef.current;
    }

    if (!skillLevel) {
      nextErrors.skillLevel = "Choose the skill level that fits you now.";
      firstInvalid ??= skillLevelRef.current;
    }

    if (!aiFamiliarity) {
      nextErrors.aiFamiliarity = "Choose how familiar you are with AI.";
      firstInvalid ??= aiFamiliarityRef.current;
    }

    if (!careerPressure) {
      nextErrors.careerPressure = "Choose how urgent your next move feels.";
      firstInvalid ??= careerPressureRef.current;
    }

    if (!firstGoal.trim()) {
      nextErrors.firstGoal =
        "Write the first result you want this platform to help with.";
      firstInvalid ??= firstGoalRef.current;
    }

    setErrors(nextErrors);

    if (firstInvalid) {
      firstInvalid.focus();
    }

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      const updated = await api.hub.profile.update({
        displayName,
        currentRole: resolvedCurrentRole,
        skillLevel: skillLevel as MemberSkillLevel,
        aiFamiliarity: aiFamiliarity as MemberAiFamiliarity,
        careerPressure: careerPressure as MemberCareerPressure,
        firstGoal,
        completeOnboarding: true,
      });

      setMemberProfile(updated);
      toast.success(isEditingAnswers ? "Answers updated" : "Answers saved");
      router.replace("/app/role");
    } catch (error) {
      console.error("[welcome] Failed to finish onboarding:", error);
      toast.error("Failed to save onboarding answers");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell
      alert={
        <Alert className="border-border/70 bg-card/70">
          <AlertCircle />
          <AlertTitle>What happens next</AlertTitle>
          <AlertDescription>
            After this triage, you will choose your team role and then connect
            your own NotebookLM Brain as a separate quest.
          </AlertDescription>
        </Alert>
      }
      description="This is a short triage, not a long setup. Tell the Hub what kind of work you do, how urgent your situation feels, and what first result you want so the platform can shape your next steps."
      stepLabel="Step 1 of 2"
      title="Start Where You Are"
    >
      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle>About You</CardTitle>
            <CardDescription>
              Add the name you want shown and tell us the kind of work you do
              today.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                autoComplete="nickname"
                id="displayName"
                name="displayName"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How you want your profile to appear..."
                value={displayName}
              />
              <p className="text-muted-foreground text-sm">
                Optional. We prefill this from your account when possible.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentRole">Current Work Type</Label>
                <p className="text-muted-foreground text-sm">
                  Pick the closest fit first. Only open custom input if none of
                  these match.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 sm:gap-4">
                {ROLE_OPTIONS.map((option, index) => {
                  const selected =
                    !isCustomRole && selectedPresetRole === option;

                  return (
                    <Button
                      aria-pressed={selected}
                      className={getPillClassName(selected)}
                      key={option}
                      onClick={() => {
                        setSelectedPresetRole(option);
                        setIsCustomRole(false);
                        setErrors((current) => ({
                          ...current,
                          currentRole: undefined,
                        }));
                      }}
                      ref={index === 0 ? currentRoleOptionRef : undefined}
                      type="button"
                      variant="outline"
                    >
                      {option}
                    </Button>
                  );
                })}

                <Button
                  aria-pressed={isCustomRole}
                  className={getPillClassName(isCustomRole)}
                  onClick={() => {
                    setIsCustomRole(true);
                    setSelectedPresetRole("");
                    setErrors((current) => ({
                      ...current,
                      currentRole: undefined,
                    }));
                    requestAnimationFrame(() => {
                      currentRoleRef.current?.focus();
                    });
                  }}
                  type="button"
                  variant="outline"
                >
                  Type a custom work type
                </Button>
              </div>

              <CurrentRoleFeedback
                currentRoleRef={currentRoleRef}
                customCurrentRole={customCurrentRole}
                error={errors.currentRole}
                isCustomRole={isCustomRole}
                onChange={(value) => {
                  setCustomCurrentRole(value);
                  setErrors((current) => ({
                    ...current,
                    currentRole: undefined,
                  }));
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle>Readiness Snapshot</CardTitle>
            <CardDescription>
              This helps shape the first pace and guidance you see in the Hub.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <OptionCardGroup
              description="Choose the level that best matches your current pace."
              error={errors.skillLevel}
              id="skill-level"
              label="Skill Level"
              onChange={(value) => {
                setSkillLevel(value);
                setErrors((current) => ({
                  ...current,
                  skillLevel: undefined,
                }));
              }}
              options={SKILL_LEVEL_OPTIONS}
              selectedValue={skillLevel}
              triggerRef={skillLevelRef}
            />

            <OptionCardGroup
              description="Tell us how often you already use AI tools in real work."
              error={errors.aiFamiliarity}
              id="ai-familiarity"
              label="AI Familiarity"
              onChange={(value) => {
                setAiFamiliarity(value);
                setErrors((current) => ({
                  ...current,
                  aiFamiliarity: undefined,
                }));
              }}
              options={AI_FAMILIARITY_OPTIONS}
              selectedValue={aiFamiliarity}
              triggerRef={aiFamiliarityRef}
            />

            <OptionCardGroup
              description="This sets the urgency level for your first recommendations."
              error={errors.careerPressure}
              id="career-pressure"
              label="Career Pressure"
              onChange={(value) => {
                setCareerPressure(value);
                setErrors((current) => ({
                  ...current,
                  careerPressure: undefined,
                }));
              }}
              options={CAREER_PRESSURE_OPTIONS}
              selectedValue={careerPressure}
              triggerRef={careerPressureRef}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle>Your First Goal</CardTitle>
            <CardDescription>
              Give the platform one concrete outcome to optimize for first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2.5">
              <Label htmlFor="firstGoal">
                What do you want this platform to help with first?
              </Label>
              <Textarea
                aria-describedby={
                  errors.firstGoal ? "first-goal-error" : undefined
                }
                aria-invalid={Boolean(errors.firstGoal)}
                className="min-h-32"
                id="firstGoal"
                name="firstGoal"
                onChange={(event) => {
                  setFirstGoal(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    firstGoal: undefined,
                  }));
                }}
                placeholder="Example: I want to become confident using AI for my client work and publish my first proof-of-work this month..."
                ref={firstGoalRef}
                value={firstGoal}
              />
              {errors.firstGoal ? (
                <p className="text-destructive text-sm" id="first-goal-error">
                  {errors.firstGoal}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Keep it concrete. We will use this to shape your first quests
                  and Brain starter context.
                </p>
              )}
            </div>

            <div className="flex justify-end border-t pt-6">
              <Button className="sm:min-w-52" disabled={saving} type="submit">
                {saving ? <Spinner className="mr-2 size-4" /> : null}
                {isEditingAnswers
                  ? "Save and return to Team Role"
                  : "Continue to Team Role"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </OnboardingShell>
  );
}
