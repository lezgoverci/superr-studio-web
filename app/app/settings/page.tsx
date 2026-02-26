"use client";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Integration } from "@/lib/api-client";
import { api } from "@/lib/api-client";

function AccountSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");

  const loadAccount = useCallback(async () => {
    try {
      const data = await api.user.get();
      setAccountName(data.name || "");
      setAccountEmail(data.email || "");
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
      await api.user.update({ name: accountName, email: accountEmail });
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
            <div className="space-y-2">
              <Label htmlFor="accountName">Name</Label>
              <Input
                id="accountName"
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Your name"
                value={accountName}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountEmail">Email</Label>
              <Input
                id="accountEmail"
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="your.email@example.com"
                type="email"
                value={accountEmail}
              />
            </div>

            <Button disabled={saving} onClick={saveAccount}>
              {saving ? <Spinner className="mr-2 size-4" /> : null}
              Save Changes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { push } = useOverlay();

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

        <Tabs className="w-full" defaultValue="account">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="providers">AI Providers</TabsTrigger>
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
                  This shell now exposes a role-aware navigation contract.
                  Integrate concrete permission policies in this page and the
                  shell context in the next pass.
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
