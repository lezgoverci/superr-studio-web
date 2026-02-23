import { PageContainer } from "@/components/app-shell/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <PageContainer contentClassName="max-w-4xl">
      <div className="space-y-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Global workspace settings will expand here as user authorization and
            role controls are introduced.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account and Permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              This shell now exposes a role-aware navigation contract. Integrate
              concrete permission policies in this page and the shell context in
              the next pass.
            </p>
            <p>Account identity is currently managed through Whop OAuth.</p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
