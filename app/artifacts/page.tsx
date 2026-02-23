import { redirect } from "next/navigation";

type LegacyArtifactsPageProps = {
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

export default async function LegacyArtifactsPage({
  searchParams,
}: LegacyArtifactsPageProps) {
  const query = buildQueryString(await searchParams);
  const targetPath = query ? `/app/library?${query}` : "/app/library";

  redirect(targetPath);
}
