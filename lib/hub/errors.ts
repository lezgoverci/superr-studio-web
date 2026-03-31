export const HUB_MIGRATION_REQUIRED_MESSAGE =
  "Hub database tables are missing. Run `pnpm db:migrate` to apply the new schema.";

type ErrorLike = {
  code?: string;
  message?: string;
  cause?: ErrorLike | null;
};

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as ErrorLike).code;
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const value = (error as ErrorLike).message;
    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function getErrorCause(error: unknown): unknown {
  if (error && typeof error === "object" && "cause" in error) {
    return (error as ErrorLike).cause;
  }

  return undefined;
}

export function isMissingRelationError(
  error: unknown,
  relationName?: string
): boolean {
  const directCode = getErrorCode(error);
  const causeCode = getErrorCode(getErrorCause(error));
  const message = getErrorMessage(error);
  const causeMessage = getErrorMessage(getErrorCause(error));
  const relationMatch = relationName
    ? [`relation "${relationName}" does not exist`, `${relationName} does not exist`]
    : [];

  return (
    directCode === "42P01" ||
    causeCode === "42P01" ||
    relationMatch.some(
      (pattern) => message.includes(pattern) || causeMessage.includes(pattern)
    )
  );
}

export function toHubMigrationError(error: unknown): Error {
  if (isMissingRelationError(error)) {
    return new Error(HUB_MIGRATION_REQUIRED_MESSAGE);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unknown Hub data error");
}
