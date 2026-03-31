"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { LevelBadge } from "@/components/hub/level-badge";

export default function ProfilePage() {
  const { memberLevel, refreshMemberProfile, setMemberProfile } =
    useAppShellContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [firstGoal, setFirstGoal] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const profile = await api.hub.profile.get();

      if (cancelled) {
        return;
      }

      setDisplayName(profile.displayName || profile.userName || "");
      setLocation(profile.location || "");
      setBio(profile.bio || "");
      setCurrentRole(profile.currentRole || "");
      setTargetRole(profile.targetRole || "");
      setFirstGoal(profile.firstGoal || "");
      setLoading(false);
    }

    loadProfile().catch((error) => {
      console.error("[me] Failed to load profile:", error);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = async () => {
    try {
      setSaving(true);
      const updated = await api.hub.profile.update({
        displayName,
        location,
        bio,
        currentRole,
        targetRole,
        firstGoal,
      });
      setMemberProfile(updated);
      await refreshMemberProfile();
      toast.success("Profile updated");
    } catch (error) {
      console.error("[me] Failed to save profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-4xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">Profile</h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Keep your operating context current so the Hub, Journey, and Brain
            stay pointed at the work you actually want.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Member Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-muted-foreground text-sm">Level</p>
              <LevelBadge className="mt-1 font-medium normal-case tracking-normal" level={memberLevel} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-muted-foreground text-sm">Current Role</p>
              <p className="mt-1 font-medium">{currentRole || "Not set"}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-muted-foreground text-sm">Target Role</p>
              <p className="mt-1 font-medium">{targetRole || "Not set"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
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
                    <Label htmlFor="me-display-name">Display Name</Label>
                    <Input
                      id="me-display-name"
                      onChange={(event) => setDisplayName(event.target.value)}
                      value={displayName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="me-location">Location</Label>
                    <Input
                      id="me-location"
                      onChange={(event) => setLocation(event.target.value)}
                      value={location}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="me-current-role">Current Role</Label>
                    <Input
                      id="me-current-role"
                      onChange={(event) => setCurrentRole(event.target.value)}
                      value={currentRole}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="me-target-role">Target Role</Label>
                    <Input
                      id="me-target-role"
                      onChange={(event) => setTargetRole(event.target.value)}
                      value={targetRole}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="me-first-goal">First Goal</Label>
                  <Input
                    id="me-first-goal"
                    onChange={(event) => setFirstGoal(event.target.value)}
                    value={firstGoal}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="me-bio">Bio</Label>
                  <Textarea
                    id="me-bio"
                    onChange={(event) => setBio(event.target.value)}
                    value={bio}
                  />
                </div>

                <Button disabled={saving} onClick={saveProfile}>
                  {saving ? <Spinner className="mr-2 size-4" /> : null}
                  Save Profile
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
