"use client";

import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signInWithWhop } from "@/lib/auth-client";

type AuthDialogProps = {
  children?: ReactNode;
  callbackURL?: string;
};

type TriggerElementProps = {
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
};

// Module-level flag to persist sign-in loading state across component remounts
// while OAuth redirects complete.
let singleProviderSignInInitiated = false;

export const isSingleProviderSignInInitiated = () =>
  singleProviderSignInInitiated;

const WhopIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg
    aria-label="Whop"
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Whop</title>
    <circle cx="60" cy="60" fill="currentColor" r="60" />
    <path
      d="M28 40H40L48 71L56 40H68L76 71L84 40H92L80 84H68L60 56L52 84H40L28 40Z"
      fill="white"
    />
  </svg>
);

export const AuthDialog = ({ children, callbackURL }: AuthDialogProps) => {
  const [loading, setLoading] = useState(singleProviderSignInInitiated);

  const handleSignIn = async () => {
    if (loading) {
      return;
    }

    singleProviderSignInInitiated = true;
    setLoading(true);

    try {
      await signInWithWhop(callbackURL);
    } catch {
      singleProviderSignInInitiated = false;
      setLoading(false);
      toast.error("Failed to sign in with Whop");
    }
  };

  if (children && isValidElement(children)) {
    const element = children as ReactElement<TriggerElementProps>;

    return cloneElement(element, {
      ...element.props,
      disabled: loading || element.props.disabled,
      onClick: (event: MouseEvent<HTMLElement>) => {
        element.props.onClick?.(event);
        if (!event.defaultPrevented) {
          handleSignIn();
        }
      },
    });
  }

  return (
    <Button
      className="h-9 gap-2 disabled:opacity-100 disabled:[&>*]:text-muted-foreground"
      disabled={loading}
      onClick={() => {
        handleSignIn();
      }}
      size="sm"
      variant="default"
    >
      {loading ? (
        <Spinner className="size-3.5" />
      ) : (
        <WhopIcon className="size-3.5" />
      )}
      <span className="text-sm">Sign In</span>
    </Button>
  );
};
