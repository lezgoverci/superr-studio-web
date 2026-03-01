import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { AUTO_GENERATED_TEMPLATES } from "@/lib/codegen-registry";
import type { IntegrationType } from "@/lib/types/integration";
import { generateWorkflowModule } from "@/lib/workflow-codegen";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow-store";
import {
  findActionById,
  getDependenciesForActions,
  getIntegration,
} from "@/plugins";

// Path to the Next.js boilerplate directory
const BOILERPLATE_PATH = join(process.cwd(), "lib", "next-boilerplate");

// Path to the codegen templates directory
const CODEGEN_TEMPLATES_PATH = join(process.cwd(), "lib", "codegen-templates");

// Regex patterns for code generation
const NON_ALPHANUMERIC_REGEX = /[^a-zA-Z0-9\s]/g;
const WHITESPACE_SPLIT_REGEX = /\s+/;
const TEMPLATE_EXPORT_REGEX = /export default `([\s\S]*)`/;
const TYPESCRIPT_EXTENSION_REGEX = /\.ts$/;
const INTEGRATION_ENV_VARS_REGEX =
  /export const INTEGRATION_ENV_VARS: Record<string, Record<string, string>> = \{[\s\S]*?\};/;
const ESCAPED_TEMPLATE_BACKTICK_REGEX = /\\`/g;
const ESCAPED_TEMPLATE_INTERPOLATION_REGEX = /\\\$\{/g;
const WORKFLOW_FUNCTION_SIGNATURE_REGEX =
  /export async function\s+([A-Za-z0-9_]+)(?:<[^>]+>)?\(([^)]*)\)/;
const IMPORT_FROM_REGEX = /\bfrom\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_REGEX = /\bimport\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_REGEX = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const CODE_FILE_EXTENSION_REGEX = /\.(?:[mc]?[jt]sx?)$/;
const DEFAULT_WORKFLOW_VERSION = "4.0.1-beta.17";
const RUN_WORKFLOW_ACTION = "Run Workflow";
const DATABASE_QUERY_ACTION = "Database Query";
const SUPPORTED_SYSTEM_ACTIONS = new Set([
  DATABASE_QUERY_ACTION,
  "HTTP Request",
  RUN_WORKFLOW_ACTION,
  "Condition",
]);
const EXPLICITLY_UNSUPPORTED_PLUGIN_ACTIONS = new Set(["ai-agent/run-agent"]);

const BINARY_EXTENSIONS = new Set([
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

export type ExportDiagnostics = {
  warnings: string[];
  unsupportedActions: string[];
  missingTemplates: string[];
};

const NODE_BUILTINS = new Set(
  builtinModules.flatMap((moduleName) =>
    moduleName.startsWith("node:")
      ? [moduleName, moduleName.slice(5)]
      : [moduleName, `node:${moduleName}`]
  )
);

/**
 * Recursively read all files from a directory
 */
export async function readDirectoryRecursive(
  dirPath: string,
  baseDir: string = dirPath
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively read subdirectories
      const subFiles = await readDirectoryRecursive(fullPath, baseDir);
      Object.assign(files, subFiles);
    } else if (entry.isFile()) {
      // Check if file is binary based on extension
      const ext = fullPath.substring(fullPath.lastIndexOf(".")).toLowerCase();
      const isBinary = BINARY_EXTENSIONS.has(ext);

      // Read file content
      const content = await readFile(fullPath, isBinary ? "base64" : "utf-8");

      // Use relative path from base directory
      const relativePath = fullPath.substring(baseDir.length + 1);
      files[relativePath] = content;
    }
  }

  return files;
}

/**
 * Convert system template filename to generated step filename
 * e.g. database-query.ts -> database-query-step.ts
 */
function toSystemStepFilePath(templatePath: string): string {
  if (templatePath.endsWith(".ts")) {
    return `lib/steps/${templatePath.replace(TYPESCRIPT_EXTENSION_REGEX, "-step.ts")}`;
  }

  return `lib/steps/${templatePath}`;
}

/**
 * Build integration->env var map for credential helper in exported project
 */
export function buildIntegrationEnvVarMap(
  integrationTypes: Set<IntegrationType>
): Record<string, Record<string, string>> {
  const integrationEnvVars: Record<string, Record<string, string>> = {};
  const sortedIntegrationTypes = Array.from(integrationTypes).sort();

  for (const integrationType of sortedIntegrationTypes) {
    const plugin = getIntegration(integrationType);
    if (!plugin) {
      continue;
    }

    const envVarMap: Record<string, string> = {};
    for (const field of plugin.formFields) {
      if (field.envVar) {
        // Preserve fetchCredentials contract: credential key maps to env var name.
        envVarMap[field.envVar] = field.envVar;
      }
    }

    if (Object.keys(envVarMap).length > 0) {
      integrationEnvVars[integrationType] = envVarMap;
    }
  }

  return integrationEnvVars;
}

/**
 * Inject generated integration env vars into exported credential helper
 */
export function injectCredentialHelperMapping(
  helperContent: string,
  integrationEnvVars: Record<string, Record<string, string>>
): string {
  const mappingLiteral = JSON.stringify(integrationEnvVars, null, 2);

  return helperContent.replace(
    INTEGRATION_ENV_VARS_REGEX,
    `export const INTEGRATION_ENV_VARS: Record<string, Record<string, string>> = ${mappingLiteral};`
  );
}

function normalizePackageName(specifier: string): string | null {
  if (!specifier) {
    return null;
  }
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/")
  ) {
    return null;
  }
  if (NODE_BUILTINS.has(specifier)) {
    return null;
  }

  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (segments.length < 2) {
      return null;
    }
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0];
}

function findAllPackageSpecifiers(content: string): Set<string> {
  const packages = new Set<string>();

  const collectWithPattern = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration pattern
    while ((match = pattern.exec(content)) !== null) {
      const packageName = normalizePackageName(match[1]);
      if (packageName) {
        packages.add(packageName);
      }
    }
  };

  collectWithPattern(IMPORT_FROM_REGEX);
  collectWithPattern(SIDE_EFFECT_IMPORT_REGEX);
  collectWithPattern(DYNAMIC_IMPORT_REGEX);

  return packages;
}

function resolveGeneratedDependencyVersions(params: {
  files: Record<string, string>;
  existingDependencies: Record<string, string>;
  sourceVersions: Record<string, string>;
}): {
  dependencies: Record<string, string>;
  missingPackages: string[];
} {
  const { files, existingDependencies, sourceVersions } = params;
  const dependencies: Record<string, string> = {};
  const missingPackages = new Set<string>();

  for (const [filePath, content] of Object.entries(files)) {
    if (!CODE_FILE_EXTENSION_REGEX.test(filePath)) {
      continue;
    }
    const packageNames = findAllPackageSpecifiers(content);
    for (const packageName of packageNames) {
      if (existingDependencies[packageName] || dependencies[packageName]) {
        continue;
      }

      const version = sourceVersions[packageName];
      if (version) {
        dependencies[packageName] = version;
      } else {
        missingPackages.add(packageName);
      }
    }
  }

  return {
    dependencies,
    missingPackages: Array.from(missingPackages).sort(),
  };
}

function extractTemplateBody(content: string): string | null {
  const templateMatch = content.match(TEMPLATE_EXPORT_REGEX);
  if (!templateMatch) {
    return null;
  }

  // Template files are source code; decode escaped template syntax
  // so generated step files contain executable TypeScript.
  return templateMatch[1]
    .replace(ESCAPED_TEMPLATE_BACKTICK_REGEX, "`")
    .replace(ESCAPED_TEMPLATE_INTERPOLATION_REGEX, "${");
}

function buildUnsupportedPluginStepTemplate(params: {
  stepFunctionName: string;
  actionId: string;
  actionLabel: string;
}): string {
  const message = `${params.actionLabel} (${params.actionId}) is not supported in standalone export.`;
  return `export async function ${params.stepFunctionName}(_input: Record<string, unknown>) {
  "use step";

  return {
    success: false,
    error: {
      message: ${JSON.stringify(message)},
    },
  };
}`;
}

/**
 * Generate workflow-specific files
 */
export function generateWorkflowFiles(workflow: {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): Record<string, string> {
  const files: Record<string, string> = {};

  // Generate camelCase function name (same as Code tab)
  const baseName =
    workflow.name
      .replace(NON_ALPHANUMERIC_REGEX, "")
      .split(WHITESPACE_SPLIT_REGEX)
      .map((word, i) => {
        if (i === 0) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join("") || "execute";

  const functionName = `${baseName}Workflow`;

  // Generate code for the workflow using the same generator as the Code tab
  const workflowCode = generateWorkflowModule(
    workflow.name,
    workflow.nodes,
    workflow.edges,
    { functionName }
  );
  const signatureMatch = workflowCode.match(WORKFLOW_FUNCTION_SIGNATURE_REGEX);
  const paramsText =
    signatureMatch && signatureMatch[1] === functionName
      ? signatureMatch[2].trim()
      : "";
  const hasWorkflowInput = paramsText.length > 0;
  const parseRequestBodyLine = hasWorkflowInput
    ? "const body = await request.json();"
    : "";
  const startCall = hasWorkflowInput
    ? `await start(${functionName}, [body]);`
    : `await start(${functionName});`;
  const fileName = sanitizeFileName(workflow.name);

  // Add workflow file
  files[`workflows/${fileName}.ts`] = workflowCode;

  // Add API route for this workflow
  files[`app/api/workflows/${fileName}/route.ts`] =
    `import { start } from 'workflow/api';
import { ${functionName} } from '@/workflows/${fileName}';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Check for authorization if WORKFLOW_API_KEY is set
    const apiKey = process.env.WORKFLOW_API_KEY;
    if (apiKey) {
      const authHeader = request.headers.get('Authorization');
      const providedKey = authHeader?.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;
        
      if (providedKey !== apiKey) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    ${parseRequestBodyLine}
    
    // Start the workflow execution
    ${startCall}
    
    return NextResponse.json({
      success: true,
      message: 'Workflow started successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
`;

  // Update app/page.tsx with workflow details
  files["app/page.tsx"] = `export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Workflow: ${workflow.name}</h1>
      <p className="mb-4 text-gray-600">API endpoint:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <a href="/api/workflows/${fileName}" className="text-blue-600 hover:underline">
            /api/workflows/${fileName}
          </a>
        </li>
      </ul>
    </main>
  );
}
`;

  return files;
}

/**
 * Get npm dependencies based on workflow nodes
 * Uses the plugin registry to dynamically determine required dependencies
 */
export function getIntegrationDependencies(
  nodes: WorkflowNode[]
): Record<string, string> {
  // Collect all action types used in the workflow
  const actionTypes = nodes
    .filter((node) => node.data.type === "action")
    .map((node) => node.data.config?.actionType as string)
    .filter(Boolean);

  // Get dependencies from plugin registry
  return getDependenciesForActions(actionTypes);
}

/**
 * Generate .env.example content from credential map used in exported project
 */
export function generateEnvExample(params: {
  includeDatabase: boolean;
  integrationEnvVars: Record<string, Record<string, string>>;
}): string {
  const { includeDatabase, integrationEnvVars } = params;
  const lines = [
    "# Add your environment variables here",
    "",
    "# Optional: Secure your workflow trigger API route",
    "WORKFLOW_API_KEY=your_secret_api_key_here",
  ];

  if (includeDatabase) {
    lines.push("");
    lines.push("# For Database integration");
    lines.push("DATABASE_URL=your_database_url");
  }

  const sortedIntegrationTypes = Object.keys(integrationEnvVars).sort();
  for (const integrationType of sortedIntegrationTypes) {
    const plugin = getIntegration(integrationType as IntegrationType);
    const envVars = Object.values(integrationEnvVars[integrationType]);
    if (!plugin || envVars.length === 0) {
      continue;
    }

    lines.push("");
    lines.push(`# For ${plugin.label} integration`);
    for (const envVar of envVars) {
      lines.push(`${envVar}=your_${envVar.toLowerCase()}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Sanitize workflow name for use as file name
 */
export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type WorkflowForExport = {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

type StepFileGenerationResult = {
  stepFiles: Record<string, string>;
  usedIntegrationTypes: Set<IntegrationType>;
  diagnostics: ExportDiagnostics;
};
type ResolvedAction = NonNullable<ReturnType<typeof findActionById>>;

function collectUsedActionTypes(nodes: WorkflowNode[]): Set<string> {
  return new Set(
    nodes
      .filter((node) => node.data.type === "action")
      .map((node) => node.data.config?.actionType as string)
      .filter(Boolean)
  );
}

function finalizeDiagnostics(
  diagnostics: ExportDiagnostics,
  unknownActionTypes: Set<string>
) {
  diagnostics.unsupportedActions = Array.from(
    new Set(diagnostics.unsupportedActions)
  ).sort();
  diagnostics.missingTemplates = Array.from(
    new Set(diagnostics.missingTemplates)
  ).sort();

  if (diagnostics.unsupportedActions.includes(RUN_WORKFLOW_ACTION)) {
    diagnostics.warnings.push(
      "Run Workflow actions are not supported in standalone exports and will return an error at runtime."
    );
  }

  if (diagnostics.missingTemplates.length > 0) {
    diagnostics.warnings.push(
      `Missing code templates for actions: ${diagnostics.missingTemplates.join(", ")}.`
    );
  }

  const unsupportedPluginActions = diagnostics.unsupportedActions
    .filter((action) => action !== RUN_WORKFLOW_ACTION)
    .sort();
  if (unsupportedPluginActions.length > 0) {
    diagnostics.warnings.push(
      `Standalone export generated fallback stubs for unsupported actions: ${unsupportedPluginActions.join(", ")}.`
    );
  }

  if (unknownActionTypes.size > 0) {
    diagnostics.warnings.push(
      `Unknown action types in workflow: ${Array.from(unknownActionTypes).sort().join(", ")}.`
    );
  }
}

function buildPluginStepFilePath(stepImportPath: string): string {
  return `lib/steps/${stepImportPath}-step.ts`;
}

function resolvePluginStepTemplate(action: ResolvedAction): string | null {
  return AUTO_GENERATED_TEMPLATES[action.id] || action.codegenTemplate || null;
}

function writeUnsupportedPluginStep(params: {
  stepFiles: Record<string, string>;
  diagnostics: ExportDiagnostics;
  action: ResolvedAction;
  missingTemplate?: boolean;
}) {
  const { stepFiles, diagnostics, action, missingTemplate = false } = params;
  if (missingTemplate) {
    diagnostics.missingTemplates.push(action.id);
  }
  diagnostics.unsupportedActions.push(action.id);
  stepFiles[buildPluginStepFilePath(action.stepImportPath)] =
    buildUnsupportedPluginStepTemplate({
      stepFunctionName: action.stepFunction,
      actionId: action.id,
      actionLabel: action.label,
    });
}

export function generateStepFilesAndDiagnostics(
  templateFiles: Record<string, string>,
  usedActionTypes: Set<string>
): StepFileGenerationResult {
  const stepFiles: Record<string, string> = {};
  const diagnostics: ExportDiagnostics = {
    warnings: [],
    unsupportedActions: [],
    missingTemplates: [],
  };
  const unknownActionTypes = new Set<string>();
  const usedIntegrationTypes = new Set<IntegrationType>();

  for (const [path, content] of Object.entries(templateFiles)) {
    const templateBody = extractTemplateBody(content);
    if (templateBody) {
      stepFiles[toSystemStepFilePath(path)] = templateBody;
    }
  }

  for (const actionType of usedActionTypes) {
    if (actionType === RUN_WORKFLOW_ACTION) {
      diagnostics.unsupportedActions.push(RUN_WORKFLOW_ACTION);
    }

    const action = findActionById(actionType);
    if (!action) {
      if (!SUPPORTED_SYSTEM_ACTIONS.has(actionType)) {
        unknownActionTypes.add(actionType);
      }
      continue;
    }

    if (EXPLICITLY_UNSUPPORTED_PLUGIN_ACTIONS.has(action.id)) {
      writeUnsupportedPluginStep({ stepFiles, diagnostics, action });
      continue;
    }

    usedIntegrationTypes.add(action.integration);

    const template = resolvePluginStepTemplate(action);
    if (!template) {
      writeUnsupportedPluginStep({
        stepFiles,
        diagnostics,
        action,
        missingTemplate: true,
      });
      continue;
    }

    stepFiles[buildPluginStepFilePath(action.stepImportPath)] = template;
  }

  finalizeDiagnostics(diagnostics, unknownActionTypes);

  return { stepFiles, usedIntegrationTypes, diagnostics };
}

export function buildReadme(
  workflowName: string,
  includesRunWorkflowAction: boolean
): string {
  const workflowFileName = sanitizeFileName(workflowName);
  const lines: string[] = [
    `# ${workflowName}`,
    "",
    "This is a Next.js workflow project generated from Workflow Builder.",
    "",
    "## Getting Started",
    "",
    "1. Install dependencies:",
    "```bash",
    "pnpm install",
    "```",
    "",
    "2. Set up environment variables:",
    "```bash",
    "cp .env.example .env.local",
    "```",
    "",
    "3. Run the development server:",
    "```bash",
    "pnpm dev",
    "```",
    "",
    "4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.",
    "",
    "## Workflow API",
    "",
    `Your workflow is available at \`/api/workflows/${workflowFileName}\`.`,
    "",
    "Send a POST request with a JSON body to trigger the workflow:",
    "",
    "```bash",
    `curl -X POST http://localhost:3000/api/workflows/${workflowFileName} \\`,
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"key\": \"value\"}'",
    "```",
    "",
    "## Deployment",
    "",
    "Deploy your workflow to Vercel:",
    "",
    "```bash",
    "vercel deploy",
    "```",
    "",
    "For more information, visit the [Workflow documentation](https://workflow.is).",
  ];

  if (includesRunWorkflowAction) {
    lines.push(
      "",
      "## Known Limitations",
      "",
      "- `Run Workflow` actions require Workflow Builder runtime orchestration and are not available in standalone exports."
    );
  }

  return lines.join("\n");
}

export async function buildExportPayload(workflow: WorkflowForExport): Promise<{
  files: Record<string, string>;
  diagnostics: ExportDiagnostics;
  usedIntegrationTypes: Set<IntegrationType>;
}> {
  const boilerplateFiles = await readDirectoryRecursive(BOILERPLATE_PATH);
  const templateFiles = await readDirectoryRecursive(CODEGEN_TEMPLATES_PATH);
  const usedActionTypes = collectUsedActionTypes(workflow.nodes);
  const { stepFiles, usedIntegrationTypes, diagnostics } =
    generateStepFilesAndDiagnostics(templateFiles, usedActionTypes);

  const workflowFiles = generateWorkflowFiles(workflow);
  const allFiles = { ...boilerplateFiles, ...stepFiles, ...workflowFiles };

  const rootPackageJson = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf-8")
  );
  const sourceDependencyVersions: Record<string, string> = {
    ...(rootPackageJson.dependencies ?? {}),
    ...(rootPackageJson.devDependencies ?? {}),
    ...(rootPackageJson.optionalDependencies ?? {}),
    ...(rootPackageJson.peerDependencies ?? {}),
  };
  const workflowVersion =
    (rootPackageJson.dependencies?.workflow as string | undefined) ||
    DEFAULT_WORKFLOW_VERSION;

  const packageJson = JSON.parse(allFiles["package.json"]);
  const integrationDependencies = getIntegrationDependencies(workflow.nodes);
  packageJson.dependencies = {
    ...packageJson.dependencies,
    workflow: workflowVersion,
    ...integrationDependencies,
  };

  const generatedDependencyResolution = resolveGeneratedDependencyVersions({
    files: { ...stepFiles, ...workflowFiles },
    existingDependencies: packageJson.dependencies,
    sourceVersions: sourceDependencyVersions,
  });
  packageJson.dependencies = {
    ...packageJson.dependencies,
    ...generatedDependencyResolution.dependencies,
  };
  if (generatedDependencyResolution.missingPackages.length > 0) {
    diagnostics.warnings.push(
      `Unable to resolve versions for generated dependencies: ${generatedDependencyResolution.missingPackages.join(", ")}.`
    );
  }

  packageJson.scripts = {
    ...packageJson.scripts,
    dev: "next dev --webpack",
    build: "next build --webpack",
  };
  allFiles["package.json"] = JSON.stringify(packageJson, null, 2);

  const integrationEnvVars = buildIntegrationEnvVarMap(usedIntegrationTypes);
  const credentialHelperPath = "lib/credential-helper.ts";
  const credentialHelperContent = allFiles[credentialHelperPath];
  if (credentialHelperContent) {
    allFiles[credentialHelperPath] = injectCredentialHelperMapping(
      credentialHelperContent,
      integrationEnvVars
    );
  } else {
    diagnostics.warnings.push(
      "Credential helper file not found in boilerplate; integration credentials were not injected."
    );
  }

  allFiles["next.config.ts"] = `import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default withWorkflow(nextConfig);
`;

  const tsConfig = JSON.parse(allFiles["tsconfig.json"]);
  tsConfig.compilerOptions.plugins = [{ name: "next" }, { name: "workflow" }];
  allFiles["tsconfig.json"] = JSON.stringify(tsConfig, null, 2);

  allFiles["README.md"] = buildReadme(
    workflow.name,
    diagnostics.unsupportedActions.includes(RUN_WORKFLOW_ACTION)
  );
  allFiles[".env.example"] = generateEnvExample({
    includeDatabase: usedActionTypes.has(DATABASE_QUERY_ACTION),
    integrationEnvVars,
  });

  diagnostics.warnings = Array.from(new Set(diagnostics.warnings));

  return { files: allFiles, diagnostics, usedIntegrationTypes };
}
