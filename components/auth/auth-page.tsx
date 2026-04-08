"use client";

import Image from "next/image";
import { AuthDialog } from "@/components/auth/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AuthPageProps = {
  nextPath: string;
  variant?: "login" | "signup";
};

function getAuthCopy(variant: "login" | "signup") {
  if (variant === "signup") {
    return {
      title: "Create Account",
      description:
        "Continue with Whop to create your Superr account. If you are not in the community yet, Superr will guide you to join after sign-in.",
    };
  }

  return {
    title: "Sign In",
    description:
      "Continue with Whop to access Superr. If you are not in the community yet, Superr will guide you to join after sign-in.",
  };
}

function AuthPage({ nextPath, variant = "login" }: AuthPageProps) {
  const copy = getAuthCopy(variant);

  return (
    <main className="pointer-events-auto flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="font-semibold text-xl">{copy.title}</CardTitle>
          <p className="text-muted-foreground text-sm">{copy.description}</p>
        </CardHeader>
        <CardContent>
          <AuthDialog callbackURL={nextPath}>
            <Button
              className="h-11 w-full gap-2 bg-[#FF6243] font-medium text-white transition-colors hover:bg-[#ff7a60]"
              size="lg"
            >
              <Image
                alt="Whop"
                className="size-5"
                height={20}
                src="/whop-logo.svg"
                width={20}
              />
              Continue with Whop
            </Button>
          </AuthDialog>
        </CardContent>
      </Card>
    </main>
  );
}

export { AuthPage };
export default AuthPage;
