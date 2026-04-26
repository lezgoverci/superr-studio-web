export const MODE_VALUES = ["auto", "api", "ui"] as const;
export const PLATFORM_VALUES = ["web", "electron"] as const;
export const AUTH_STRATEGY_VALUES = ["none", "state-file"] as const;
export const INPUT_TYPE_VALUES = ["string", "number", "boolean"] as const;
export const RESPONSE_TYPE_VALUES = ["json", "text", "bytes"] as const;

export type CliMode = (typeof MODE_VALUES)[number];
export type AppPlatform = (typeof PLATFORM_VALUES)[number];
export type AuthStrategy = (typeof AUTH_STRATEGY_VALUES)[number];
export type CommandInputType = (typeof INPUT_TYPE_VALUES)[number];
export type ResponseType = (typeof RESPONSE_TYPE_VALUES)[number];

export type ManifestApp = {
  name: string;
  slug: string;
  bin: string;
  platform: AppPlatform;
  defaultMode: CliMode;
  homeDir: string;
  defaultSessionName: string;
  baseUrl?: string;
  electron?: {
    cdpPort: number;
    appName?: string;
    launchCommand?: string;
  };
};

export type ManifestAuthEnv = {
  name: string;
  description: string;
  secret: boolean;
};

export type ManifestAuth = {
  strategy: AuthStrategy;
  loginUrl?: string;
  stateFile: string;
  loginFlowId?: string;
  env: ManifestAuthEnv[];
};

export type ManifestEntity = {
  name: string;
  plural: string;
  description?: string;
};

export type ManifestCommandInput = {
  name: string;
  flag: string;
  alias?: string;
  type: CommandInputType;
  description: string;
  required: boolean;
};

export type ManifestCommand = {
  id: string;
  path: string[];
  description: string;
  mode: CliMode;
  requestRecipeId?: string;
  flowId?: string;
  inputs: ManifestCommandInput[];
  output: {
    type: ResponseType;
  };
};

export type ManifestRequestRecipe = {
  id: string;
  method: string;
  url: string;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body?: unknown;
  responseType: ResponseType;
  useCookies: boolean;
};

export type ManifestFlowStep = Record<string, unknown> & {
  action: string;
};

export type ManifestFlow = {
  id: string;
  description: string;
  steps: ManifestFlowStep[];
  result?: Record<string, unknown>;
};

export type ManifestSelector = {
  id: string;
  value: string;
  notes?: string;
};

export type AppCliManifest = {
  version: 1;
  app: ManifestApp;
  auth: ManifestAuth;
  entities: ManifestEntity[];
  commands: ManifestCommand[];
  requestRecipes: ManifestRequestRecipe[];
  flows: ManifestFlow[];
  selectors: ManifestSelector[];
  regeneration: {
    capturedAt: string;
    source: string;
    sourceNotes: string[];
    fingerprints: Record<string, unknown>;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert(isRecord(value), `${label} must be an object.`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return;
  }

  assert(typeof value === "string", `${label} must be a string.`);
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function requiredString(value: unknown, label: string): string {
  const normalized = optionalString(value, label);
  assert(normalized, `${label} is required.`);
  return normalized;
}

function asStringArray(value: unknown, label: string): string[] {
  assert(Array.isArray(value), `${label} must be an array.`);
  return value.map((entry, index) =>
    requiredString(entry, `${label}[${index}]`)
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function validateManifestShape(input: unknown): AppCliManifest {
  const manifest = asRecord(input, "Manifest");
  const version = manifest.version ?? 1;
  assert(version === 1, "Manifest version must be 1.");

  const app = asRecord(manifest.app, "Manifest app");
  const platform = requiredString(app.platform, "Manifest app.platform");
  assert(
    PLATFORM_VALUES.includes(platform as AppPlatform),
    `Manifest app.platform must be one of ${PLATFORM_VALUES.join(", ")}.`
  );

  const defaultMode =
    optionalString(app.defaultMode, "Manifest app.defaultMode") ?? "auto";
  assert(
    MODE_VALUES.includes(defaultMode as CliMode),
    `Manifest app.defaultMode must be one of ${MODE_VALUES.join(", ")}.`
  );

  const normalizedApp: ManifestApp = {
    name: requiredString(app.name, "Manifest app.name"),
    slug: requiredString(app.slug, "Manifest app.slug"),
    bin: requiredString(app.bin, "Manifest app.bin"),
    platform: platform as AppPlatform,
    defaultMode: defaultMode as CliMode,
    homeDir:
      optionalString(app.homeDir, "Manifest app.homeDir") ??
      `.${requiredString(app.slug, "Manifest app.slug")}`,
    defaultSessionName:
      optionalString(
        app.defaultSessionName,
        "Manifest app.defaultSessionName"
      ) ?? requiredString(app.slug, "Manifest app.slug"),
    ...(optionalString(app.baseUrl, "Manifest app.baseUrl")
      ? { baseUrl: optionalString(app.baseUrl, "Manifest app.baseUrl") }
      : {}),
  };

  if (normalizedApp.platform === "web") {
    assert(
      normalizedApp.baseUrl,
      'Manifest app.baseUrl is required for "web" targets.'
    );
  }

  if (normalizedApp.platform === "electron") {
    const electron = asRecord(app.electron ?? {}, "Manifest app.electron");
    normalizedApp.electron = {
      cdpPort: Number.isFinite(Number(electron.cdpPort))
        ? Number(electron.cdpPort)
        : 9222,
      ...(optionalString(electron.appName, "Manifest app.electron.appName")
        ? {
            appName: optionalString(
              electron.appName,
              "Manifest app.electron.appName"
            ),
          }
        : {}),
      ...(optionalString(
        electron.launchCommand,
        "Manifest app.electron.launchCommand"
      )
        ? {
            launchCommand: optionalString(
              electron.launchCommand,
              "Manifest app.electron.launchCommand"
            ),
          }
        : {}),
    };
  }

  const auth = asRecord(manifest.auth ?? { strategy: "none" }, "Manifest auth");
  const authStrategy =
    optionalString(auth.strategy, "Manifest auth.strategy") ?? "none";
  assert(
    AUTH_STRATEGY_VALUES.includes(authStrategy as AuthStrategy),
    `Manifest auth.strategy must be one of ${AUTH_STRATEGY_VALUES.join(", ")}.`
  );

  const normalizedAuth: ManifestAuth = {
    strategy: authStrategy as AuthStrategy,
    ...(optionalString(auth.loginUrl, "Manifest auth.loginUrl")
      ? { loginUrl: optionalString(auth.loginUrl, "Manifest auth.loginUrl") }
      : {}),
    stateFile:
      optionalString(auth.stateFile, "Manifest auth.stateFile") ??
      "auth-state.json",
    ...(optionalString(auth.loginFlowId, "Manifest auth.loginFlowId")
      ? {
          loginFlowId: optionalString(
            auth.loginFlowId,
            "Manifest auth.loginFlowId"
          ),
        }
      : {}),
    env: Array.isArray(auth.env)
      ? auth.env.map((entry, index) => {
          const normalizedEntry = asRecord(
            entry,
            `Manifest auth.env[${index}]`
          );
          return {
            name: requiredString(
              normalizedEntry.name,
              `Manifest auth.env[${index}].name`
            ),
            description:
              optionalString(
                normalizedEntry.description,
                `Manifest auth.env[${index}].description`
              ) ?? "",
            secret: Boolean(normalizedEntry.secret),
          };
        })
      : [],
  };

  const entities: ManifestEntity[] = Array.isArray(manifest.entities)
    ? manifest.entities.map((entry, index) => {
        const normalizedEntry = asRecord(entry, `Manifest entities[${index}]`);
        const name = requiredString(
          normalizedEntry.name,
          `Manifest entities[${index}].name`
        );

        return {
          name,
          plural:
            optionalString(
              normalizedEntry.plural,
              `Manifest entities[${index}].plural`
            ) ?? `${name}s`,
          ...(optionalString(
            normalizedEntry.description,
            `Manifest entities[${index}].description`
          )
            ? {
                description: optionalString(
                  normalizedEntry.description,
                  `Manifest entities[${index}].description`
                ),
              }
            : {}),
        };
      })
    : [];

  const requestRecipes: ManifestRequestRecipe[] = Array.isArray(
    manifest.requestRecipes
  )
    ? manifest.requestRecipes.map((entry, index) => {
        const normalizedEntry = asRecord(
          entry,
          `Manifest requestRecipes[${index}]`
        );
        const responseType =
          optionalString(
            normalizedEntry.responseType,
            `Manifest requestRecipes[${index}].responseType`
          ) ?? "json";

        assert(
          RESPONSE_TYPE_VALUES.includes(responseType as ResponseType),
          `Manifest requestRecipes[${index}] responseType must be one of ${RESPONSE_TYPE_VALUES.join(", ")}.`
        );

        return {
          id: requiredString(
            normalizedEntry.id,
            `Manifest requestRecipes[${index}].id`
          ),
          method: requiredString(
            normalizedEntry.method,
            `Manifest requestRecipes[${index}].method`
          ).toUpperCase(),
          url: requiredString(
            normalizedEntry.url,
            `Manifest requestRecipes[${index}].url`
          ),
          headers: isRecord(normalizedEntry.headers)
            ? cloneJson(normalizedEntry.headers)
            : {},
          query: isRecord(normalizedEntry.query)
            ? cloneJson(normalizedEntry.query)
            : {},
          ...(normalizedEntry.body === undefined
            ? {}
            : { body: cloneJson(normalizedEntry.body) }),
          responseType: responseType as ResponseType,
          useCookies:
            normalizedEntry.useCookies === undefined
              ? true
              : Boolean(normalizedEntry.useCookies),
        };
      })
    : [];

  const flows: ManifestFlow[] = Array.isArray(manifest.flows)
    ? manifest.flows.map((entry, index) => {
        const normalizedEntry = asRecord(entry, `Manifest flows[${index}]`);
        const steps = Array.isArray(normalizedEntry.steps)
          ? normalizedEntry.steps.map((step, stepIndex) => {
              const normalizedStep = asRecord(
                step,
                `Manifest flow "${normalizedEntry.id ?? index}" step ${stepIndex + 1}`
              );

              return {
                ...cloneJson(normalizedStep),
                action: requiredString(
                  normalizedStep.action,
                  `Manifest flow "${normalizedEntry.id ?? index}" step ${stepIndex + 1} action`
                ),
              };
            })
          : [];

        assert(
          steps.length > 0,
          `Manifest flow "${normalizedEntry.id ?? index}" must include at least one step.`
        );

        return {
          id: requiredString(normalizedEntry.id, `Manifest flows[${index}].id`),
          description:
            optionalString(
              normalizedEntry.description,
              `Manifest flows[${index}].description`
            ) ??
            requiredString(normalizedEntry.id, `Manifest flows[${index}].id`),
          steps,
          ...(isRecord(normalizedEntry.result)
            ? { result: cloneJson(normalizedEntry.result) }
            : {}),
        };
      })
    : [];

  const selectors: ManifestSelector[] = Array.isArray(manifest.selectors)
    ? manifest.selectors.map((entry, index) => {
        const normalizedEntry = asRecord(entry, `Manifest selectors[${index}]`);
        return {
          id: requiredString(
            normalizedEntry.id,
            `Manifest selectors[${index}].id`
          ),
          value: requiredString(
            normalizedEntry.value,
            `Manifest selectors[${index}].value`
          ),
          ...(optionalString(
            normalizedEntry.notes,
            `Manifest selectors[${index}].notes`
          )
            ? {
                notes: optionalString(
                  normalizedEntry.notes,
                  `Manifest selectors[${index}].notes`
                ),
              }
            : {}),
        };
      })
    : [];

  const commands: ManifestCommand[] = Array.isArray(manifest.commands)
    ? manifest.commands.map((entry, index) => {
        const normalizedEntry = asRecord(entry, `Manifest commands[${index}]`);
        const mode =
          optionalString(
            normalizedEntry.mode,
            `Manifest commands[${index}].mode`
          ) ?? normalizedApp.defaultMode;

        assert(
          MODE_VALUES.includes(mode as CliMode),
          `Manifest command "${normalizedEntry.id ?? index}" mode must be one of ${MODE_VALUES.join(", ")}.`
        );

        const inputs: ManifestCommandInput[] = Array.isArray(
          normalizedEntry.inputs
        )
          ? normalizedEntry.inputs.map((input, inputIndex) => {
              const normalizedInput = asRecord(
                input,
                `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1}`
              );
              const type =
                optionalString(
                  normalizedInput.type,
                  `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1} type`
                ) ?? "string";

              assert(
                INPUT_TYPE_VALUES.includes(type as CommandInputType),
                `Manifest command "${normalizedEntry.id ?? index}" input type must be one of ${INPUT_TYPE_VALUES.join(", ")}.`
              );

              return {
                name: requiredString(
                  normalizedInput.name,
                  `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1} name`
                ),
                flag: requiredString(
                  normalizedInput.flag,
                  `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1} flag`
                ),
                ...(optionalString(
                  normalizedInput.alias,
                  `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1} alias`
                )
                  ? {
                      alias: optionalString(
                        normalizedInput.alias,
                        `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1} alias`
                      ),
                    }
                  : {}),
                type: type as CommandInputType,
                description:
                  optionalString(
                    normalizedInput.description,
                    `Manifest command "${normalizedEntry.id ?? index}" input ${inputIndex + 1} description`
                  ) ?? "",
                required: Boolean(normalizedInput.required),
              };
            })
          : [];

        const output = isRecord(normalizedEntry.output)
          ? normalizedEntry.output
          : {};
        const outputType =
          optionalString(
            output.type,
            `Manifest command "${normalizedEntry.id ?? index}" output.type`
          ) ?? "text";

        assert(
          RESPONSE_TYPE_VALUES.includes(outputType as ResponseType),
          `Manifest command "${normalizedEntry.id ?? index}" output.type must be one of ${RESPONSE_TYPE_VALUES.join(", ")}.`
        );

        return {
          id: requiredString(
            normalizedEntry.id,
            `Manifest commands[${index}].id`
          ),
          path: asStringArray(
            normalizedEntry.path,
            `Manifest command "${normalizedEntry.id ?? index}" path`
          ),
          description: requiredString(
            normalizedEntry.description,
            `Manifest command "${normalizedEntry.id ?? index}" description`
          ),
          mode: mode as CliMode,
          ...(optionalString(
            normalizedEntry.requestRecipeId,
            `Manifest command "${normalizedEntry.id ?? index}" requestRecipeId`
          )
            ? {
                requestRecipeId: optionalString(
                  normalizedEntry.requestRecipeId,
                  `Manifest command "${normalizedEntry.id ?? index}" requestRecipeId`
                ),
              }
            : {}),
          ...(optionalString(
            normalizedEntry.flowId,
            `Manifest command "${normalizedEntry.id ?? index}" flowId`
          )
            ? {
                flowId: optionalString(
                  normalizedEntry.flowId,
                  `Manifest command "${normalizedEntry.id ?? index}" flowId`
                ),
              }
            : {}),
          inputs,
          output: {
            type: outputType as ResponseType,
          },
        };
      })
    : [];

  const requestRecipeIds = new Set(requestRecipes.map((entry) => entry.id));
  const flowIds = new Set(flows.map((entry) => entry.id));

  for (const command of commands) {
    assert(
      command.requestRecipeId || command.flowId,
      `Command "${command.id}" must provide a requestRecipeId, a flowId, or both.`
    );

    if (command.requestRecipeId) {
      assert(
        requestRecipeIds.has(command.requestRecipeId),
        `Command "${command.id}" references missing request recipe "${command.requestRecipeId}".`
      );
    }

    if (command.flowId) {
      assert(
        flowIds.has(command.flowId),
        `Command "${command.id}" references missing flow "${command.flowId}".`
      );
    }
  }

  if (normalizedAuth.strategy === "state-file" && normalizedAuth.loginFlowId) {
    assert(
      flowIds.has(normalizedAuth.loginFlowId),
      `Manifest auth.loginFlowId "${normalizedAuth.loginFlowId}" does not match any flow.`
    );
  }

  const regeneration = isRecord(manifest.regeneration)
    ? manifest.regeneration
    : {};

  return {
    version: 1,
    app: normalizedApp,
    auth: normalizedAuth,
    entities,
    commands,
    requestRecipes,
    flows,
    selectors,
    regeneration: {
      capturedAt:
        optionalString(
          regeneration.capturedAt,
          "Manifest regeneration.capturedAt"
        ) ?? new Date().toISOString(),
      source:
        optionalString(regeneration.source, "Manifest regeneration.source") ??
        "runtime-observation",
      sourceNotes: Array.isArray(regeneration.sourceNotes)
        ? regeneration.sourceNotes.map((entry, index) =>
            requiredString(entry, `Manifest regeneration.sourceNotes[${index}]`)
          )
        : [],
      fingerprints: isRecord(regeneration.fingerprints)
        ? cloneJson(regeneration.fingerprints)
        : {},
    },
  };
}
