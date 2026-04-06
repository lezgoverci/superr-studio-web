"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type OnboardingErrors = {
  currentRole?: string;
  skillLevel?: string;
  aiFamiliarity?: string;
  careerPressure?: string;
  firstGoal?: string;
};

type OptionCardGroupProps = {
  error?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  selectedValue: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

function OptionCardGroup({
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
      <Label>{label}</Label>
      <div className="grid gap-3 md:grid-cols-3">
        {options.map((option, index) => {
          const selected = selectedValue === option.value;

          return (
            <Button
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={Boolean(error)}
              aria-pressed={selected}
              className={cn(
                "h-auto min-h-20 justify-start whitespace-normal px-4 py-3 text-left",
                selected ? "border-primary shadow-sm" : "border-border"
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              ref={index === 0 ? triggerRef : undefined}
              type="button"
              variant={selected ? "default" : "outline"}
            >
              <span>{option.label}</span>
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

export default function WelcomePage() {
  const router = useRouter();
  const { memberProfile, setMemberProfile } = useAppShellContext();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<OnboardingErrors>({});

  const [displayName, setDisplayName] = useState(
    memberProfile?.displayName || ""
  );
  const [currentRole, setCurrentRole] = useState(
    memberProfile?.currentRole || ""
  );
  const [skillLevel, setSkillLevel] = useState(memberProfile?.skillLevel || "");
  const [aiFamiliarity, setAiFamiliarity] = useState(
    memberProfile?.aiFamiliarity || ""
  );
  const [careerPressure, setCareerPressure] = useState(
    memberProfile?.careerPressure || ""
  );
  const [firstGoal, setFirstGoal] = useState(memberProfile?.firstGoal || "");

  const currentRoleRef = useRef<HTMLInputElement>(null);
  const skillLevelRef = useRef<HTMLButtonElement>(null);
  const aiFamiliarityRef = useRef<HTMLButtonElement>(null);
  const careerPressureRef = useRef<HTMLButtonElement>(null);
  const firstGoalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!memberProfile) {
      return;
    }

    setDisplayName(memberProfile.displayName || memberProfile.userName || "");
    setCurrentRole(memberProfile.currentRole || "");
    setSkillLevel(memberProfile.skillLevel || "");
    setAiFamiliarity(memberProfile.aiFamiliarity || "");
    setCareerPressure(memberProfile.careerPressure || "");
    setFirstGoal(memberProfile.firstGoal || "");
  }, [memberProfile]);

  const validateForm = () => {
    const nextErrors: OnboardingErrors = {};
    let firstInvalid: HTMLElement | null = null;

    if (!currentRole.trim()) {
      nextErrors.currentRole = "Choose or type your current work type.";
      firstInvalid = currentRoleRef.current;
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
        currentRole,
        skillLevel: skillLevel as MemberSkillLevel,
        aiFamiliarity: aiFamiliarity as MemberAiFamiliarity,
        careerPressure: careerPressure as MemberCareerPressure,
        firstGoal,
        completeOnboarding: true,
      });
      setMemberProfile(updated);
      toast.success("Onboarding complete");
      router.replace("/app/role");
    } catch (error) {
      console.error("[welcome] Failed to finish onboarding:", error);
      toast.error("Failed to finish onboarding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-4xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
            Welcome
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Start Where You Are
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            This is a short triage, not a long setup. Tell the Hub what kind of
            work you do, how urgent your situation feels, and what first result
            you want so the platform can shape your next steps.
          </p>
        </div>

        <Alert>
          <AlertCircle />
          <AlertTitle>What happens next</AlertTitle>
          <AlertDescription>
            After this triage, you will choose your team role and then connect
            your own NotebookLM Brain as a separate quest.
          </AlertDescription>
        </Alert>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>About You</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  autoComplete="nickname"
                  id="displayName"
                  name="displayName"
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="How you want your profile to appear…"
                  value={displayName}
                />
                <p className="text-muted-foreground text-sm">
                  Optional. We prefill this from your account when possible.
                </p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="currentRole">Current Work Type</Label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((option) => {
                    const selected = currentRole === option;

                    return (
                      <Button
                        aria-pressed={selected}
                        key={option}
                        onClick={() => {
                          setCurrentRole(option);
                          setErrors((current) => ({
                            ...current,
                            currentRole: undefined,
                          }));
                        }}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {option}
                      </Button>
                    );
                  })}
                </div>
                <Input
                  aria-describedby={
                    errors.currentRole ? "current-role-error" : undefined
                  }
                  aria-invalid={Boolean(errors.currentRole)}
                  autoComplete="off"
                  id="currentRole"
                  name="currentRole"
                  onChange={(event) => {
                    setCurrentRole(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      currentRole: undefined,
                    }));
                  }}
                  placeholder="Or type your work type in your own words…"
                  ref={currentRoleRef}
                  value={currentRole}
                />
                {errors.currentRole ? (
                  <p
                    className="text-destructive text-sm"
                    id="current-role-error"
                  >
                    {errors.currentRole}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Pick the closest fit or type your own answer.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Readiness Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <OptionCardGroup
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

          <Card>
            <CardHeader>
              <CardTitle>Your First Goal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstGoal">
                  What do you want this platform to help with first?
                </Label>
                <Textarea
                  aria-describedby={
                    errors.firstGoal ? "first-goal-error" : undefined
                  }
                  aria-invalid={Boolean(errors.firstGoal)}
                  id="firstGoal"
                  name="firstGoal"
                  onChange={(event) => {
                    setFirstGoal(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      firstGoal: undefined,
                    }));
                  }}
                  placeholder="Example: I want to become confident using AI for my client work and publish my first proof-of-work this month…"
                  ref={firstGoalRef}
                  value={firstGoal}
                />
                {errors.firstGoal ? (
                  <p className="text-destructive text-sm" id="first-goal-error">
                    {errors.firstGoal}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Keep it concrete. We will use this to shape your first
                    quests and Brain starter context.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                  This should take about a minute.
                </p>
                <Button disabled={saving} type="submit">
                  {saving ? <Spinner className="mr-2 size-4" /> : null}
                  Continue to Team Role
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </PageContainer>
  );
}
