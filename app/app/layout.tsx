import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { auth } from "@/lib/auth";
import { getHubMemberProfile } from "@/lib/hub/member-profiles";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const initialMemberProfile = session?.user?.id
    ? await getHubMemberProfile(session.user.id, {
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      })
    : null;

  return (
    <AppShell initialMemberProfile={initialMemberProfile}>
      {children}
    </AppShell>
  );
}
