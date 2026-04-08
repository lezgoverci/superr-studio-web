"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import {
  getRecommendedMemberRole,
  MEMBER_ROLE_DETAILS,
} from "@/lib/hub/content";
import type { MemberRole } from "@/lib/hub/types";
import { cn } from "@/lib/utils";

function isMemberRole(value: string): value is MemberRole {
  return MEMBER_ROLE_DETAILS.some((role) => role.value === value);
}

export default function RolePage() {
  const router = useRouter();
  const { memberProfile, setMemberProfile } = useAppShellContext();
  const [selectedRole, setSelectedRole] = useState<MemberRole>("hero");
  const [saving, setSaving] = useState(false);

  const recommendedRole = getRecommendedMemberRole({
    currentRole: memberProfile?.currentRole ?? null,
    targetRole: memberProfile?.targetRole ?? null,
    firstGoal: memberProfile?.firstGoal ?? null,
    aiFamiliarity: memberProfile?.aiFamiliarity ?? null,
  });

  useEffect(() => {
    setSelectedRole(memberProfile?.role ?? recommendedRole);
  }, [memberProfile?.role, recommendedRole]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const updated = await api.hub.profile.update({
        role: selectedRole,
      });
      setMemberProfile(updated);
      toast.success("Team role saved");
      router.replace("/app");
    } catch (error) {
      console.error("[role] Failed to save role:", error);
      toast.error("Failed to save team role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
            Team Role
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Choose Your Party Role
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Your role shapes how you contribute inside a four-person team. Pick
            the lane that feels most natural now. You can update it later in
            your profile.
          </p>
        </div>

        <Alert>
          <Sparkles />
          <AlertTitle>
            Recommended:{" "}
            {
              MEMBER_ROLE_DETAILS.find((role) => role.value === recommendedRole)
                ?.label
            }
          </AlertTitle>
          <AlertDescription>
            This recommendation is based on your onboarding answers. Use it as a
            strong starting point, not a hard rule.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2">
          <RadioGroup
            aria-label="Team role"
            className="grid gap-4 md:col-span-2 md:grid-cols-2"
            onValueChange={(value: string) => {
              if (isMemberRole(value)) {
                setSelectedRole(value);
              }
            }}
            value={selectedRole}
          >
            {MEMBER_ROLE_DETAILS.map((role) => {
              const selected = selectedRole === role.value;
              const recommended = recommendedRole === role.value;
              const inputId = `team-role-${role.value}`;

              return (
                <div className="h-full" key={role.value}>
                  <RadioGroupItem
                    className="peer sr-only"
                    id={inputId}
                    value={role.value}
                  />
                  <Label
                    className={cn(
                      "flex h-full min-h-44 cursor-pointer flex-col items-start justify-between gap-6 rounded-2xl border bg-card px-5 py-5 text-left font-normal leading-normal shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40",
                      selected &&
                        "border-primary bg-primary/[0.04] shadow-md ring-[3px] ring-primary/12"
                    )}
                    htmlFor={inputId}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {recommended ? (
                            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 font-medium text-[11px] text-primary uppercase tracking-[0.18em]">
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          <div className="font-semibold text-xl">
                            {role.label}
                          </div>
                          <div className="text-muted-foreground text-sm">
                            {role.title}
                          </div>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-transparent"
                        )}
                      >
                        <Check className="size-4" />
                      </span>
                    </div>

                    <p className="max-w-sm text-base text-foreground/85 leading-7">
                      {role.description}
                    </p>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What This Unlocks</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-muted-foreground text-sm">
              Once you choose your role, you will land in the Hub and can move
              into the next F-Class quest: connect your Brain and start building
              context around your real work.
            </p>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? <Spinner className="mr-2 size-4" /> : null}
              Enter the Hub
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
