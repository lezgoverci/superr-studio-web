"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import {
  getRecommendedMemberRole,
  MEMBER_ROLE_DETAILS,
} from "@/lib/hub/content";
import type { MemberRole } from "@/lib/hub/types";

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
          {MEMBER_ROLE_DETAILS.map((role) => {
            const selected = selectedRole === role.value;

            return (
              <Card
                className={selected ? "border-primary shadow-sm" : undefined}
                key={role.value}
              >
                <CardContent className="p-0">
                  <Button
                    aria-pressed={selected}
                    className="h-full min-h-44 w-full justify-start whitespace-normal rounded-xl px-5 py-5 text-left"
                    onClick={() => setSelectedRole(role.value)}
                    type="button"
                    variant={selected ? "default" : "ghost"}
                  >
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="font-semibold text-lg">
                          {role.label}
                        </div>
                        <div className="text-sm opacity-80">{role.title}</div>
                      </div>
                      <p className="max-w-sm text-sm opacity-90">
                        {role.description}
                      </p>
                    </div>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
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
