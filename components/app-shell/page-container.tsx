import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageContainer({
  children,
  className,
  contentClassName,
}: PageContainerProps) {
  return (
    <main
      className={cn(
        "pointer-events-auto h-full w-full overflow-auto",
        className
      )}
    >
      <div
        className={cn("mx-auto w-full max-w-6xl p-6 md:p-8", contentClassName)}
      >
        {children}
      </div>
    </main>
  );
}
