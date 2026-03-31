"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import {
  AI_FAMILIARITY_OPTIONS,
  CAREER_PRESSURE_OPTIONS,
  getStarterSources,
  ROLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
} from "@/lib/hub/content";
import type {
  HubBrainResponse,
  HubMemberProfile,
  MemberAiFamiliarity,
  MemberCareerPressure,
  MemberSkillLevel,
} from "@/lib/hub/types";

function resolveInitialStep(profile: HubMemberProfile | null) {
  if (!profile) {
    return 1;
  }

  if (profile.firstGoal) {
    return 3;
  }

  if (profile.notebooklmNotebookId) {
    return 3;
  }

  if (
    profile.currentRole &&
    profile.targetRole &&
    profile.skillLevel &&
    profile.aiFamiliarity &&
    profile.careerPressure
  ) {
    return 2;
  }

  return 1;
}

export default function WelcomePage() {
  const { memberProfile, refreshMemberProfile, setMemberProfile } =
    useAppShellContext();
  const [step, setStep] = useState(resolveInitialStep(memberProfile));
  const [savingTriage, setSavingTriage] = useState(false);
  const [provisioningBrain, setProvisioningBrain] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [brain, setBrain] = useState<HubBrainResponse | null>(null);

  const [displayName, setDisplayName] = useState(memberProfile?.displayName || "");
  const [currentRole, setCurrentRole] = useState(memberProfile?.currentRole || "");
  const [targetRole, setTargetRole] = useState(memberProfile?.targetRole || "");
  const [skillLevel, setSkillLevel] = useState(memberProfile?.skillLevel || "");
  const [aiFamiliarity, setAiFamiliarity] = useState(
    memberProfile?.aiFamiliarity || ""
  );
  const [careerPressure, setCareerPressure] = useState(
    memberProfile?.careerPressure || ""
  );
  const [firstGoal, setFirstGoal] = useState(memberProfile?.firstGoal || "");

  useEffect(() => {
    if (!memberProfile) {
      return;
    }

    setDisplayName(memberProfile.displayName || memberProfile.userName || "");
    setCurrentRole(memberProfile.currentRole || "");
    setTargetRole(memberProfile.targetRole || "");
    setSkillLevel(memberProfile.skillLevel || "");
    setAiFamiliarity(memberProfile.aiFamiliarity || "");
    setCareerPressure(memberProfile.careerPressure || "");
    setFirstGoal(memberProfile.firstGoal || "");
    setStep(resolveInitialStep(memberProfile));
  }, [memberProfile]);

  const starterSources = memberProfile ? getStarterSources(memberProfile) : [];

  const saveTriage = async () => {
    if (
      !currentRole ||
      !targetRole ||
      !skillLevel ||
      !aiFamiliarity ||
      !careerPressure
    ) {
      toast.error("Complete each onboarding field before continuing.");
      return;
    }

    try {
      setSavingTriage(true);
      const updated = await api.hub.profile.update({
        displayName,
        currentRole,
        targetRole,
        skillLevel: skillLevel as MemberSkillLevel,
        aiFamiliarity: aiFamiliarity as MemberAiFamiliarity,
        careerPressure: careerPressure as MemberCareerPressure,
      });
      setMemberProfile(updated);
      setStep(2);
      toast.success("Onboarding profile saved");
    } catch (error) {
      console.error("[welcome] Failed to save triage:", error);
      toast.error("Failed to save onboarding details");
    } finally {
      setSavingTriage(false);
    }
  };

  const provisionBrain = async () => {
    try {
      setProvisioningBrain(true);
      const provisioned = await api.hub.brain.provision();
      setBrain(provisioned);
      const refreshed = await refreshMemberProfile();
      if (refreshed) {
        setMemberProfile(refreshed);
      }
      setStep(3);
      toast.success("Brain is ready");
    } catch (error) {
      console.error("[welcome] Failed to provision brain:", error);
      toast.error("Failed to provision the Brain");
    } finally {
      setProvisioningBrain(false);
    }
  };

  const finishOnboarding = async () => {
    if (!firstGoal.trim()) {
      toast.error("Set your first goal before finishing onboarding.");
      return;
    }

    try {
      setFinishing(true);
      const updated = await api.hub.profile.update({
        firstGoal,
        completeOnboarding: true,
      });
      setMemberProfile(updated);
      toast.success("Onboarding complete");
    } catch (error) {
      console.error("[welcome] Failed to finish onboarding:", error);
      toast.error("Failed to finish onboarding");
    } finally {
      setFinishing(false);
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
            Set up your Hub workspace
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            This flow captures your current stage, provisions your platform-managed
            Brain, and locks the first goal your Journey should optimize for.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            { id: 1, title: "Profile", description: "Role and direction" },
            { id: 2, title: "Brain", description: "Provision your notebook" },
            { id: 3, title: "Goal", description: "Commit your first sprint" },
          ].map((item) => (
            <Card
              className={step === item.id ? "border-primary/50" : ""}
              key={item.id}
            >
              <CardContent className="space-y-1 p-4">
                <p className="font-medium text-sm">
                  Step {item.id}: {item.title}
                </p>
                <p className="text-muted-foreground text-sm">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {step === 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Tell the platform where you are now</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="How you want to appear in the Hub"
                  value={displayName}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Current Role</Label>
                  <Select onValueChange={setCurrentRole} value={currentRole}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose your current role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Role</Label>
                  <Select onValueChange={setTargetRole} value={targetRole}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose your target role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Skill Level</Label>
                  <Select onValueChange={setSkillLevel} value={skillLevel}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose your level" />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_LEVEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>AI Familiarity</Label>
                  <Select
                    onValueChange={setAiFamiliarity}
                    value={aiFamiliarity}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose your AI fluency" />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_FAMILIARITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Career Pressure</Label>
                  <Select
                    onValueChange={setCareerPressure}
                    value={careerPressure}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="How urgent is your next move?" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAREER_PRESSURE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button disabled={savingTriage} onClick={saveTriage}>
                {savingTriage ? <Spinner className="mr-2 size-4" /> : null}
                Save and continue
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardHeader>
              <CardTitle>Provision your Brain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                The platform manages NotebookLM setup behind the scenes. Your
                onboarding answers seed the first notebook context automatically.
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {starterSources.map((source) => (
                  <Card className="bg-muted/30" key={source.id}>
                    <CardContent className="space-y-2 p-4">
                      <p className="font-medium text-sm">{source.title}</p>
                      <p className="text-muted-foreground text-sm">
                        {source.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {brain?.serviceMessage ? (
                <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                  {brain.serviceMessage}
                </div>
              ) : null}

              <div className="flex gap-3">
                <Button onClick={() => setStep(1)} type="button" variant="outline">
                  Back
                </Button>
                <Button disabled={provisioningBrain} onClick={provisionBrain}>
                  {provisioningBrain ? <Spinner className="mr-2 size-4" /> : null}
                  Provision Brain
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardHeader>
              <CardTitle>Lock your first sprint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstGoal">First Goal</Label>
                <Textarea
                  id="firstGoal"
                  onChange={(event) => setFirstGoal(event.target.value)}
                  placeholder="Describe the next concrete result you want from the platform."
                  value={firstGoal}
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm">
                The Hub will use this goal to shape your Journey tasks, Brain
                context, and Builder recommendations.
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setStep(2)} type="button" variant="outline">
                  Back
                </Button>
                <Button disabled={finishing} onClick={finishOnboarding}>
                  {finishing ? <Spinner className="mr-2 size-4" /> : null}
                  Finish onboarding
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}
