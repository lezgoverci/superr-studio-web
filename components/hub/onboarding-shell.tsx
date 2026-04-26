import type { ReactNode } from "react";
import { PageContainer } from "@/components/app-shell/page-container";
import { cn } from "@/lib/utils";

type OnboardingShellProps = {
  alert?: ReactNode;
  children: ReactNode;
  className?: string;
  description: string;
  stepLabel: string;
  title: string;
};

export function OnboardingShell({
  alert,
  children,
  className,
  description,
  stepLabel,
  title,
}: OnboardingShellProps) {
  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 md:gap-8">
        <div className="space-y-3">
          <div className="inline-flex items-center rounded-full border border-border/70 bg-background px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
            {stepLabel}
          </div>
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
              {title}
            </h1>
            <p className="max-w-2xl text-balance text-muted-foreground text-sm leading-6 md:text-base">
              {description}
            </p>
          </div>
        </div>

        {alert ? <div>{alert}</div> : null}

        <div className={cn("flex flex-col gap-5 md:gap-6", className)}>
          {children}
        </div>
      </div>
    </PageContainer>
  );
}
