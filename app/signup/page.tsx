import AuthPage from "@/components/auth/auth-page";
import { resolvePostAuthRedirect } from "@/lib/auth-redirect";

type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const query = await searchParams;
  const nextPath = resolvePostAuthRedirect(firstValue(query.next));

  return <AuthPage nextPath={nextPath} variant="signup" />;
}
