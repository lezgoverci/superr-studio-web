import {
  ArrowRight,
  BookOpen,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const QUICK_LINKS = [
  {
    title: "Workflows",
    description: "Open the canvas builder and continue automation design.",
    href: "/app/workflows",
    icon: Workflow,
  },
  {
    title: "Library",
    description: "Review captured artifacts and published outputs.",
    href: "/app/library",
    icon: BookOpen,
  },
  {
    title: "Settings",
    description: "Manage account, connections, and environment preferences.",
    href: "/app/settings",
    icon: Settings2,
  },
];

export default function DashboardPage() {
  return (
    <PageContainer>
      <div className="space-y-8">
        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground text-xs uppercase tracking-[0.16em]">
            <Sparkles className="size-3.5" />
            App Workspace
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Build workflows inside a structured app shell
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            The builder canvas now lives as one app page. Use the global header
            and navigation to move across workflows, library assets, and
            workspace settings as the product grows.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/workflows/new">New Workflow</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app/workflows">Open Recent Workflow</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Card key={link.href}>
                <CardHeader className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4" />
                    {link.title}
                  </CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    asChild
                    className="w-full justify-between"
                    variant="ghost"
                  >
                    <Link href={link.href}>
                      Open {link.title}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </PageContainer>
  );
}
