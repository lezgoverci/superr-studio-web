"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
    <OnboardingShell
      className="gap-8 md:gap-12"
      alert={
        <Alert className="border-border/70 bg-card/70">
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
            strong starting point, then adjust it if another lane feels more
            natural.
          </AlertDescription>
        </Alert>
      }
      description="Your role shapes how you contribute inside a four-person team. Pick the lane that feels most natural now. You can still go back and update your onboarding answers before entering the Hub."
      stepLabel="Step 2 of 2"
      title="Choose Your Party Role"
    >
      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>Select your default lane</CardTitle>
          <CardDescription>
            The role you choose here becomes your starting point in the Hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-label="Team role"
            className="grid gap-4 md:grid-cols-2"
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
              let indicatorClassName =
                "border-border/70 bg-background text-transparent";

              if (selected) {
                indicatorClassName =
                  "border-primary text-primary";
              } else if (recommended) {
                indicatorClassName =
                  "border-primary/30 text-transparent";
              }

              return (
                <div className="h-full" key={role.value}>
                  <RadioGroupItem
                    className="peer sr-only"
                    id={inputId}
                    value={role.value}
                  />
                  <Label
                    className={cn(
                      "flex h-full cursor-pointer flex-col gap-4 rounded-2xl border border-border/70 bg-card p-6 text-left font-normal leading-normal shadow-none transition-all hover:bg-accent/40 peer-focus-visible:border-primary peer-focus-visible:ring-1 peer-focus-visible:ring-primary",
                      selected &&
                        "border-primary ring-1 ring-primary"
                    )}
                    htmlFor={inputId}
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-semibold text-xl">
                            {role.label}
                          </div>
                          <div className="text-muted-foreground text-sm">
                            {role.title}
                          </div>
                      </div>

                      <span
                        className={cn(
                          "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                          indicatorClassName
                        )}
                      >
                        {selected && <Check className="size-3.5 stroke-[3]" />}
                      </span>
                    </div>

                    <p className="pt-2 text-base text-muted-foreground leading-relaxed">
                      {role.description}
                    </p>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>What This Unlocks</CardTitle>
          <CardDescription>
            This finishes onboarding and drops you into the Hub with your role
            set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">
            Once you choose your role, you will land in the Hub and can move
            into the next F-Class quest: connect your Brain and start building
            context around your real work.
          </p>

          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <Button
              disabled={saving}
              onClick={() => router.push("/app/welcome")}
              type="button"
              variant="outline"
            >
              Back to Welcome
            </Button>
            <Button
              className="sm:min-w-40"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              {saving ? <Spinner className="mr-2 size-4" /> : null}
              Enter the Hub
            </Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
