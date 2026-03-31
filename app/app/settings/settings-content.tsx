"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { AddConnectionOverlay } from "@/components/overlays/add-connection-overlay";
import {
  DeleteConnectionOverlay,
  EditConnectionOverlay,
} from "@/components/overlays/edit-connection-overlay";
import { useOverlay } from "@/components/overlays/overlay-provider";
import { AiProvidersSection } from "@/components/settings/ai-providers-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { OpenCodeServerSection } from "@/components/settings/opencode-server-section";
import { SkillsSection } from "@/components/settings/skills-section";
import { WorkflowSection } from "@/components/settings/workflow-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Integration } from "@/lib/api-client";
import { api } from "@/lib/api-client";
import { LEVEL_LABELS } from "@/lib/hub/content";
import { useAppShellContext } from "@/components/app-shell/shell-context";

const SETTINGS_TAB_VALUES = [
  "account",
  "connections",
  "api-keys",
  "providers",
  "agent-server",
  "skills",
  "workflow",
  "appearance",
  "permissions",
] as const;

function isSettingsTabValue(
  value: string
): value is (typeof SETTINGS_TAB_VALUES)[number] {
  return SETTINGS_TAB_VALUES.includes(
    value as (typeof SETTINGS_TAB_VALUES)[number]
  );
}

function AccountSection() {
  const { refreshMemberProfile } = useAppShellContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [firstGoal, setFirstGoal] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [memberLevel, setMemberLevel] = useState<1 | 2 | 3 | 4>(1);

  const loadAccount = useCallback(async () => {
    try {
      const data = await api.hub.profile.get();
      setDisplayName(data.displayName || data.userName || "");
      setLocation(data.location || "");
      setBio(data.bio || "");
      setCurrentRole(data.currentRole || "");
      setTargetRole(data.targetRole || "");
      setFirstGoal(data.firstGoal || "");
      setUserName(data.userName || "");
      setUserEmail(data.userEmail || "");
      setMemberLevel(data.level);
    } catch (error) {
      console.error("Failed to load account:", error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAccount().finally(() => setLoading(false));
  }, [loadAccount]);

  const saveAccount = async () => {
    try {
      setSaving(true);
      await api.hub.profile.update({
        displayName,
        location,
        bio,
        currentRole,
        targetRole,
        firstGoal,
      });
      await refreshMemberProfile();
      await loadAccount();
      toast.success("Settings saved");
    } catch (error) {
      console.error("Failed to save account:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How your Hub profile should appear"
                  value={displayName}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, timezone, or market"
                  value={location}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentRole">Current Role</Label>
                <Input
                  id="currentRole"
                  onChange={(e) => setCurrentRole(e.target.value)}
                  placeholder="What you do today"
                  value={currentRole}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetRole">Target Role</Label>
                <Input
                  id="targetRole"
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="What you want to grow into"
                  value={targetRole}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="firstGoal">First Goal</Label>
              <Input
                id="firstGoal"
                onChange={(e) => setFirstGoal(e.target.value)}
                placeholder="The outcome you are optimizing for next"
                value={firstGoal}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short summary of what you are building toward"
                value={bio}
              />
            </div>

            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="font-medium text-sm">Whop Identity</p>
                <p className="text-muted-foreground text-sm">
                  {userName || "Managed by Whop"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Email</p>
                <p className="text-muted-foreground text-sm">
                  {userEmail || "Unavailable"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Member Level</p>
                <p className="text-muted-foreground text-sm">
                  {memberLevel} · {LEVEL_LABELS[memberLevel]}
                </p>
              </div>
            </div>

            <Button disabled={saving} onClick={saveAccount}>
              {saving ? <Spinner className="mr-2 size-4" /> : null}
              Save Changes
            </Button>

            <p className="text-muted-foreground text-xs">
              Account identity is managed through Whop OAuth. Use this section
              for your Hub profile and onboarding context.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsContent() {
  const searchParams = useSearchParams();
  const { push } = useOverlay();
  const [activeTab, setActiveTab] =
    useState<(typeof SETTINGS_TAB_VALUES)[number]>("account");

  useEffect(() => {
    const requestedTab = searchParams.get("tab")?.trim();
    if (requestedTab && isSettingsTabValue(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  const handleOpenAddConnection = () => {
    push(AddConnectionOverlay, {
      onSuccess: () => {
        window.location.reload();
      },
    });
  };

  const handleOpenEditConnection = (integration: Integration) => {
    push(EditConnectionOverlay, {
      integration,
      onSuccess: () => {
        window.location.reload();
      },
      onDelete: () => {
        window.location.reload();
      },
    });
  };

  const handleOpenDeleteConnection = (integration: Integration) => {
    push(DeleteConnectionOverlay, {
      integration,
      onSuccess: () => {
        window.location.reload();
      },
    });
  };

  return (
    <PageContainer contentClassName="max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs
          className="w-full"
          onValueChange={(value) => {
            if (isSettingsTabValue(value)) {
              setActiveTab(value);
            }
          }}
          value={activeTab}
        >
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="providers">AI Providers</TabsTrigger>
            <TabsTrigger value="agent-server">AI Agent</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent className="mt-6 space-y-4" value="account">
            <AccountSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="connections">
            <ConnectionsSection
              onOpenAddConnection={handleOpenAddConnection}
              onOpenDeleteConnection={handleOpenDeleteConnection}
              onOpenEditConnection={handleOpenEditConnection}
            />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="api-keys">
            <ApiKeysSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="providers">
            <AiProvidersSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="agent-server">
            <OpenCodeServerSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="skills">
            <SkillsSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="workflow">
            <WorkflowSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="appearance">
            <AppearanceSection />
          </TabsContent>

          <TabsContent className="mt-6 space-y-4" value="permissions">
            <Card>
              <CardHeader>
                <CardTitle>Account and Permissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-muted-foreground text-sm">
                <p>
                  The shell now uses member level and onboarding state to shape
                  Workspace and Builder access.
                </p>
                <p>Account identity is currently managed through Whop OAuth.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
