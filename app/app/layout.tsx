import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { auth } from "@/lib/auth";
import { getHubMemberProfile } from "@/lib/hub/member-profiles";
import { getWhopCommunityAccess } from "@/lib/whop-access";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const [initialMemberProfile, initialWhopAccess] = session?.user?.id
    ? await Promise.all([
        getHubMemberProfile(session.user.id, {
          name: session.user.name ?? null,
          image: session.user.image ?? null,
        }),
        getWhopCommunityAccess(session.user.id),
      ])
    : [null, null];

  return (
    <AppShell
      initialMemberProfile={initialMemberProfile}
      initialWhopAccess={initialWhopAccess}
    >
      {children}
    </AppShell>
  );
}
