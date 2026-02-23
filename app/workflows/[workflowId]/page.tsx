import { redirect } from "next/navigation";

type LegacyWorkflowPageProps = {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildQueryString(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
    }
  }

  return params.toString();
}

export default async function LegacyWorkflowPage({
  params,
  searchParams,
}: LegacyWorkflowPageProps) {
  const { workflowId } = await params;
  const query = buildQueryString(await searchParams);
  const targetPath = query
    ? `/app/workflows/${workflowId}?${query}`
    : `/app/workflows/${workflowId}`;

  redirect(targetPath);
}
