import fs from "node:fs/promises";
import path from "node:path";

const MODE_VALUES = new Set(["auto", "api", "ui"]);
const PLATFORM_VALUES = new Set(["web", "electron"]);
const AUTH_STRATEGY_VALUES = new Set(["none", "state-file"]);
const INPUT_TYPE_VALUES = new Set(["string", "number", "boolean"]);
const RESPONSE_TYPE_VALUES = new Set(["json", "text", "bytes"]);
const COMMAND_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

export const BUILTIN_TOP_LEVEL_COMMANDS = new Set([
  "auth",
  "help",
  "inspect",
  "raw",
  "regen",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function asPlainObject(value, label) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`
  );
  return value;
}

function asOptionalString(value, label) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  assert(typeof value === "string", `${label} must be a string.`);
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asRequiredString(value, label) {
  const normalized = asOptionalString(value, label);
  assert(normalized, `${label} is required.`);
  return normalized;
}

function asStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array.`);
  return value.map((entry, index) =>
    asRequiredString(entry, `${label}[${index}]`)
  );
}

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function slugify(value) {
  const normalized = toKebabCase(value || "app");
  return normalized || "app";
}

function defaultFlagForName(name) {
  return `--${toKebabCase(name)}`;
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTemplateMap(value, label) {
  if (value === undefined) {
    return {};
  }

  const map = asPlainObject(value, label);
  return cloneJsonValue(map);
}

function normalizeFlowStep(step, index, flowId) {
  const normalizedStep = asPlainObject(
    step,
    `Flow "${flowId}" step ${index + 1}`
  );
  const action = asRequiredString(
    normalizedStep.action,
    `Flow "${flowId}" step ${index + 1} action`
  );

  return {
    ...cloneJsonValue(normalizedStep),
    action,
  };
}

function normalizeCommandInput(input, index, commandId) {
  const normalizedInput = asPlainObject(
    input,
    `Command "${commandId}" input ${index + 1}`
  );
  const name = asRequiredString(
    normalizedInput.name,
    `Command "${commandId}" input ${index + 1} name`
  );

  assert(
    IDENTIFIER_PATTERN.test(name),
    `Command "${commandId}" input "${name}" must match ${IDENTIFIER_PATTERN.source}.`
  );

  const type = asOptionalString(
    normalizedInput.type,
    `Command "${commandId}" input "${name}" type`
  );
  const normalizedType = type ?? "string";

  assert(
    INPUT_TYPE_VALUES.has(normalizedType),
    `Command "${commandId}" input "${name}" type must be one of ${[
      ...INPUT_TYPE_VALUES,
    ].join(", ")}.`
  );

  const flag =
    asOptionalString(
      normalizedInput.flag,
      `Command "${commandId}" input "${name}" flag`
    ) ?? defaultFlagForName(name);

  return {
    name,
    flag,
    type: normalizedType,
    description:
      asOptionalString(
        normalizedInput.description,
        `Command "${commandId}" input "${name}" description`
      ) ?? `Value for ${name}`,
    required: Boolean(normalizedInput.required),
    ...(asOptionalString(
      normalizedInput.alias,
      `Command "${commandId}" input "${name}" alias`
    )
      ? {
          alias: asOptionalString(
            normalizedInput.alias,
            `Command "${commandId}" input "${name}" alias`
          ),
        }
      : {}),
  };
}

function normalizeOutput(output, commandId) {
  if (output === undefined) {
    return { type: "text" };
  }

  const normalizedOutput = asPlainObject(
    output,
    `Command "${commandId}" output`
  );
  const type =
    asOptionalString(
      normalizedOutput.type,
      `Command "${commandId}" output type`
    ) ?? "text";

  assert(
    RESPONSE_TYPE_VALUES.has(type),
    `Command "${commandId}" output type must be one of ${[
      ...RESPONSE_TYPE_VALUES,
    ].join(", ")}.`
  );

  return { type };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Manifest validation intentionally normalizes the full schema in one pass.
export function validateManifest(manifestInput) {
  const manifest = asPlainObject(manifestInput, "Manifest");
  const version = manifest.version ?? 1;
  assert(version === 1, "Manifest version must be 1.");

  const app = asPlainObject(manifest.app, "Manifest app");
  const appName = asRequiredString(app.name, "Manifest app.name");
  const platform = asRequiredString(app.platform, "Manifest app.platform");

  assert(
    PLATFORM_VALUES.has(platform),
    `Manifest app.platform must be one of ${[...PLATFORM_VALUES].join(", ")}.`
  );

  const slug =
    asOptionalString(app.slug, "Manifest app.slug") ?? slugify(appName);
  const bin = asOptionalString(app.bin, "Manifest app.bin") ?? slug;
  const defaultMode =
    asOptionalString(app.defaultMode, "Manifest app.defaultMode") ?? "auto";

  assert(
    MODE_VALUES.has(defaultMode),
    `Manifest app.defaultMode must be one of ${[...MODE_VALUES].join(", ")}.`
  );

  const normalizedApp = {
    name: appName,
    slug,
    bin,
    platform,
    defaultMode,
    homeDir:
      asOptionalString(app.homeDir, "Manifest app.homeDir") ?? `.${slug}`,
    defaultSessionName:
      asOptionalString(
        app.defaultSessionName,
        "Manifest app.defaultSessionName"
      ) ?? slug,
    ...(asOptionalString(app.baseUrl, "Manifest app.baseUrl")
      ? { baseUrl: asOptionalString(app.baseUrl, "Manifest app.baseUrl") }
      : {}),
  };

  if (platform === "web") {
    assert(
      normalizedApp.baseUrl,
      'Manifest app.baseUrl is required for "web" targets.'
    );
  }

  if (platform === "electron") {
    const electron = asPlainObject(app.electron ?? {}, "Manifest app.electron");
    normalizedApp.electron = {
      cdpPort: Number.isFinite(Number(electron.cdpPort))
        ? Number(electron.cdpPort)
        : 9222,
      ...(asOptionalString(electron.appName, "Manifest app.electron.appName")
        ? {
            appName: asOptionalString(
              electron.appName,
              "Manifest app.electron.appName"
            ),
          }
        : {}),
      ...(asOptionalString(
        electron.launchCommand,
        "Manifest app.electron.launchCommand"
      )
        ? {
            launchCommand: asOptionalString(
              electron.launchCommand,
              "Manifest app.electron.launchCommand"
            ),
          }
        : {}),
    };
  }

  const rawAuth = manifest.auth ?? { strategy: "none" };
  const auth = asPlainObject(rawAuth, "Manifest auth");
  const authStrategy =
    asOptionalString(auth.strategy, "Manifest auth.strategy") ?? "none";

  assert(
    AUTH_STRATEGY_VALUES.has(authStrategy),
    `Manifest auth.strategy must be one of ${[...AUTH_STRATEGY_VALUES].join(
      ", "
    )}.`
  );

  const normalizedAuth = {
    strategy: authStrategy,
    ...(asOptionalString(auth.loginUrl, "Manifest auth.loginUrl")
      ? { loginUrl: asOptionalString(auth.loginUrl, "Manifest auth.loginUrl") }
      : {}),
    stateFile:
      asOptionalString(auth.stateFile, "Manifest auth.stateFile") ??
      "auth-state.json",
    env: Array.isArray(auth.env)
      ? auth.env.map((entry, index) => {
          const normalizedEntry = asPlainObject(
            entry,
            `Manifest auth.env[${index}]`
          );
          return {
            name: asRequiredString(
              normalizedEntry.name,
              `Manifest auth.env[${index}].name`
            ),
            description:
              asOptionalString(
                normalizedEntry.description,
                `Manifest auth.env[${index}].description`
              ) ?? "",
            secret: Boolean(normalizedEntry.secret),
          };
        })
      : [],
    ...(asOptionalString(auth.loginFlowId, "Manifest auth.loginFlowId")
      ? {
          loginFlowId: asOptionalString(
            auth.loginFlowId,
            "Manifest auth.loginFlowId"
          ),
        }
      : {}),
  };

  const entities = Array.isArray(manifest.entities)
    ? manifest.entities.map((entry, index) => {
        const normalizedEntry = asPlainObject(
          entry,
          `Manifest entities[${index}]`
        );
        const name = asRequiredString(
          normalizedEntry.name,
          `Manifest entities[${index}].name`
        );

        return {
          name,
          plural:
            asOptionalString(
              normalizedEntry.plural,
              `Manifest entities[${index}].plural`
            ) ?? `${name}s`,
          ...(asOptionalString(
            normalizedEntry.description,
            `Manifest entities[${index}].description`
          )
            ? {
                description: asOptionalString(
                  normalizedEntry.description,
                  `Manifest entities[${index}].description`
                ),
              }
            : {}),
        };
      })
    : [];

  const requestRecipes = Array.isArray(manifest.requestRecipes)
    ? manifest.requestRecipes.map((entry, index) => {
        const normalizedEntry = asPlainObject(
          entry,
          `Manifest requestRecipes[${index}]`
        );
        const id = asRequiredString(
          normalizedEntry.id,
          `Manifest requestRecipes[${index}].id`
        );
        const method = asRequiredString(
          normalizedEntry.method,
          `Manifest requestRecipes[${index}].method`
        ).toUpperCase();
        const responseType =
          asOptionalString(
            normalizedEntry.responseType,
            `Manifest requestRecipes[${index}].responseType`
          ) ?? "json";

        assert(
          RESPONSE_TYPE_VALUES.has(responseType),
          `Manifest request recipe "${id}" responseType must be one of ${[
            ...RESPONSE_TYPE_VALUES,
          ].join(", ")}.`
        );

        return {
          id,
          method,
          url: asRequiredString(
            normalizedEntry.url,
            `Manifest requestRecipes[${index}].url`
          ),
          headers: normalizeTemplateMap(
            normalizedEntry.headers,
            `Manifest request recipe "${id}" headers`
          ),
          query: normalizeTemplateMap(
            normalizedEntry.query,
            `Manifest request recipe "${id}" query`
          ),
          ...(normalizedEntry.body === undefined
            ? {}
            : { body: cloneJsonValue(normalizedEntry.body) }),
          responseType,
          useCookies:
            normalizedEntry.useCookies === undefined
              ? true
              : Boolean(normalizedEntry.useCookies),
        };
      })
    : [];

  const flows = Array.isArray(manifest.flows)
    ? manifest.flows.map((entry, index) => {
        const normalizedEntry = asPlainObject(
          entry,
          `Manifest flows[${index}]`
        );
        const id = asRequiredString(
          normalizedEntry.id,
          `Manifest flows[${index}].id`
        );
        const steps = Array.isArray(normalizedEntry.steps)
          ? normalizedEntry.steps.map((step, stepIndex) =>
              normalizeFlowStep(step, stepIndex, id)
            )
          : [];

        assert(
          steps.length > 0,
          `Flow "${id}" must include at least one step.`
        );

        return {
          id,
          description:
            asOptionalString(
              normalizedEntry.description,
              `Manifest flow "${id}" description`
            ) ?? id,
          steps,
          ...(normalizedEntry.result === undefined
            ? {}
            : {
                result: cloneJsonValue(
                  asPlainObject(
                    normalizedEntry.result,
                    `Manifest flow "${id}" result`
                  )
                ),
              }),
        };
      })
    : [];

  const selectors = Array.isArray(manifest.selectors)
    ? manifest.selectors.map((entry, index) => {
        const normalizedEntry = asPlainObject(
          entry,
          `Manifest selectors[${index}]`
        );
        return {
          id: asRequiredString(
            normalizedEntry.id,
            `Manifest selectors[${index}].id`
          ),
          value: asRequiredString(
            normalizedEntry.value,
            `Manifest selectors[${index}].value`
          ),
          ...(asOptionalString(
            normalizedEntry.notes,
            `Manifest selectors[${index}].notes`
          )
            ? {
                notes: asOptionalString(
                  normalizedEntry.notes,
                  `Manifest selectors[${index}].notes`
                ),
              }
            : {}),
        };
      })
    : [];

  const commands = Array.isArray(manifest.commands)
    ? manifest.commands.map((entry, index) => {
        const normalizedEntry = asPlainObject(
          entry,
          `Manifest commands[${index}]`
        );
        const id = asRequiredString(
          normalizedEntry.id,
          `Manifest commands[${index}].id`
        );
        const pathSegments = asStringArray(
          normalizedEntry.path,
          `Manifest command "${id}" path`
        );

        assert(
          pathSegments.every((segment) =>
            COMMAND_SEGMENT_PATTERN.test(segment)
          ),
          `Manifest command "${id}" path segments must match ${COMMAND_SEGMENT_PATTERN.source}.`
        );
        assert(
          !BUILTIN_TOP_LEVEL_COMMANDS.has(pathSegments[0]),
          `Manifest command "${id}" uses reserved top-level segment "${pathSegments[0]}".`
        );

        const mode =
          asOptionalString(
            normalizedEntry.mode,
            `Manifest command "${id}" mode`
          ) ?? normalizedApp.defaultMode;

        assert(
          MODE_VALUES.has(mode),
          `Manifest command "${id}" mode must be one of ${[...MODE_VALUES].join(
            ", "
          )}.`
        );

        const inputs = Array.isArray(normalizedEntry.inputs)
          ? normalizedEntry.inputs.map((inputConfig, inputIndex) =>
              normalizeCommandInput(inputConfig, inputIndex, id)
            )
          : [];

        return {
          id,
          path: pathSegments,
          description: asRequiredString(
            normalizedEntry.description,
            `Manifest command "${id}" description`
          ),
          mode,
          inputs,
          output: normalizeOutput(normalizedEntry.output, id),
          ...(asOptionalString(
            normalizedEntry.requestRecipeId,
            `Manifest command "${id}" requestRecipeId`
          )
            ? {
                requestRecipeId: asOptionalString(
                  normalizedEntry.requestRecipeId,
                  `Manifest command "${id}" requestRecipeId`
                ),
              }
            : {}),
          ...(asOptionalString(
            normalizedEntry.flowId,
            `Manifest command "${id}" flowId`
          )
            ? {
                flowId: asOptionalString(
                  normalizedEntry.flowId,
                  `Manifest command "${id}" flowId`
                ),
              }
            : {}),
        };
      })
    : [];

  const requestRecipeIds = new Set();
  for (const recipe of requestRecipes) {
    assert(
      !requestRecipeIds.has(recipe.id),
      `Duplicate request recipe id "${recipe.id}".`
    );
    requestRecipeIds.add(recipe.id);
  }

  const flowIds = new Set();
  for (const flow of flows) {
    assert(!flowIds.has(flow.id), `Duplicate flow id "${flow.id}".`);
    flowIds.add(flow.id);
  }

  const commandIds = new Set();
  const commandPaths = new Set();
  for (const command of commands) {
    assert(
      !commandIds.has(command.id),
      `Duplicate command id "${command.id}".`
    );
    commandIds.add(command.id);

    const pathKey = command.path.join(" ");
    assert(!commandPaths.has(pathKey), `Duplicate command path "${pathKey}".`);
    commandPaths.add(pathKey);

    assert(
      command.requestRecipeId || command.flowId,
      `Command "${command.id}" must reference a requestRecipeId, a flowId, or both.`
    );

    if (command.mode === "api") {
      assert(
        command.requestRecipeId,
        `Command "${command.id}" is api-only but has no requestRecipeId.`
      );
    }

    if (command.mode === "ui") {
      assert(
        command.flowId,
        `Command "${command.id}" is ui-only but has no flowId.`
      );
    }

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

    const inputNames = new Set();
    const commandFlags = new Set(["--headed", "--json", "--mode", "--session"]);
    for (const inputEntry of command.inputs) {
      assert(
        !inputNames.has(inputEntry.name),
        `Command "${command.id}" repeats input name "${inputEntry.name}".`
      );
      inputNames.add(inputEntry.name);

      assert(
        !commandFlags.has(inputEntry.flag),
        `Command "${command.id}" input flag "${inputEntry.flag}" collides with a reserved global flag.`
      );
      commandFlags.add(inputEntry.flag);
      if (inputEntry.alias) {
        assert(
          !commandFlags.has(inputEntry.alias),
          `Command "${command.id}" input alias "${inputEntry.alias}" collides with a reserved or duplicated flag.`
        );
        commandFlags.add(inputEntry.alias);
      }
    }
  }

  if (normalizedAuth.strategy === "state-file") {
    assert(
      normalizedAuth.loginFlowId,
      'Manifest auth.loginFlowId is required when auth.strategy is "state-file".'
    );
    assert(
      flowIds.has(normalizedAuth.loginFlowId),
      `Manifest auth.loginFlowId "${normalizedAuth.loginFlowId}" does not match any flow.`
    );
  }

  const regeneration =
    manifest.regeneration === undefined
      ? {}
      : asPlainObject(manifest.regeneration, "Manifest regeneration");

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
        asOptionalString(
          regeneration.capturedAt,
          "Manifest regeneration.capturedAt"
        ) ?? new Date().toISOString(),
      source:
        asOptionalString(regeneration.source, "Manifest regeneration.source") ??
        "runtime-observation",
      sourceNotes: Array.isArray(regeneration.sourceNotes)
        ? regeneration.sourceNotes.map((entry, index) =>
            asRequiredString(
              entry,
              `Manifest regeneration.sourceNotes[${index}]`
            )
          )
        : [],
      fingerprints: normalizeTemplateMap(
        regeneration.fingerprints,
        "Manifest regeneration.fingerprints"
      ),
    },
  };
}

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Skeleton generation intentionally covers web and electron defaults in a single helper.
export function buildManifestSkeleton(options) {
  const appName = asRequiredString(options.appName, "Application name");
  const platform = asRequiredString(options.platform, "Platform");
  const target = asRequiredString(options.target, "Target");
  const slug = slugify(appName);
  const bin = options.binName ? slugify(options.binName) : slug;
  const authStrategy = options.authStrategy ?? "none";

  assert(
    PLATFORM_VALUES.has(platform),
    `Platform must be one of ${[...PLATFORM_VALUES].join(", ")}.`
  );
  assert(
    AUTH_STRATEGY_VALUES.has(authStrategy),
    `Auth strategy must be one of ${[...AUTH_STRATEGY_VALUES].join(", ")}.`
  );

  const manifest = {
    version: 1,
    app: {
      name: appName,
      slug,
      bin,
      platform,
      defaultMode: "auto",
      homeDir: `.${slug}`,
      defaultSessionName: slug,
    },
    auth:
      authStrategy === "state-file"
        ? {
            strategy: "state-file",
            loginUrl:
              options.loginUrl ?? (platform === "web" ? `${target}/login` : ""),
            stateFile: "auth-state.json",
            loginFlowId: "auth-login",
            env: [
              {
                name: "APP_USERNAME",
                description: "Login username or email",
              },
              {
                name: "APP_PASSWORD",
                description: "Login password",
                secret: true,
              },
            ],
          }
        : {
            strategy: "none",
            stateFile: "auth-state.json",
            env: [],
          },
    entities: [],
    commands: [],
    requestRecipes: [],
    flows: [],
    selectors: [],
    regeneration: {
      capturedAt: new Date().toISOString(),
      source: "runtime-observation",
      sourceNotes: [
        "Initialized by app-to-cli-generator",
        "Populate commands, flows, and request recipes from live capture artifacts",
      ],
      fingerprints:
        platform === "web"
          ? { target }
          : {
              target,
              cdpPort: String(options.cdpPort ?? 9222),
            },
    },
  };

  if (platform === "web") {
    manifest.app.baseUrl = target;
  } else {
    manifest.app.electron = {
      appName: target,
      cdpPort: Number(options.cdpPort ?? 9222),
      ...(options.launchCommand
        ? { launchCommand: options.launchCommand }
        : {}),
    };
  }

  if (authStrategy === "state-file") {
    manifest.flows.push({
      id: "auth-login",
      description:
        "Replace this placeholder login flow with captured selectors and actions.",
      steps: [
        ...(platform === "web"
          ? [
              {
                action: "open",
                url: manifest.auth.loginUrl || "{{app.baseUrl}}/login",
              },
            ]
          : [{ action: "connect", port: Number(options.cdpPort ?? 9222) }]),
        {
          action: "snapshot",
          interactive: true,
          saveAs: "loginSnapshot",
        },
        {
          action: "saveState",
        },
      ],
      result: {
        template:
          "Replace auth-login with the captured selectors before relying on this flow.",
      },
    });
  }

  return validateManifest(manifest);
}
