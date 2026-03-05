import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { IntegrationType } from "../types/integration";
import { generateId } from "../utils/id";

// Better Auth tables
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // Anonymous user tracking
  isAnonymous: boolean("is_anonymous").default(false),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Workflow visibility type
export type WorkflowVisibility = "private" | "public";

// Workflows table with user association
export const workflows = pgTable("workflows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  description: text("description"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  nodes: jsonb("nodes").notNull().$type<any[]>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  edges: jsonb("edges").notNull().$type<any[]>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  uiSpec: jsonb("ui_spec").$type<Record<string, any> | null>(),
  uiSpecVersion: text("ui_spec_version"),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  uiMetadata: jsonb("ui_metadata").$type<Record<string, any> | null>(),
  visibility: text("visibility")
    .notNull()
    .default("private")
    .$type<WorkflowVisibility>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Integrations table for storing user credentials
export const integrations = pgTable("integrations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull().$type<IntegrationType>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - encrypted credentials stored as JSON
  config: jsonb("config").notNull().$type<any>(),
  // Whether this integration was created via OAuth (managed by app) vs manual entry
  isManaged: boolean("is_managed").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OpencodeConnectionMode =
  | "self_hosted"
  | "managed_shared"
  | "dedicated";

export const opencodeConnections = pgTable(
  "opencode_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name"),
    mode: text("mode")
      .notNull()
      .default("self_hosted")
      .$type<OpencodeConnectionMode>(),
    baseUrl: text("base_url").notNull(),
    directory: text("directory"),
    username: text("username").notNull(),
    passwordEncrypted: text("password_encrypted").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("opencode_connections_user_id_idx").on(table.userId),
  })
);

// User preferences table for per-user settings
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workflowOperationDelayMs: integer("workflow_operation_delay_ms")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdUnique: uniqueIndex("user_preferences_user_id_unique").on(
      table.userId
    ),
  })
);

// User skills table to track installed AI agent skills per user
export type SkillStatus = "installed" | "installing" | "failed";

export const userSkills = pgTable(
  "user_skills",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    description: text("description"),
    source: text("source").notNull(),
    sourceType: text("source_type")
      .notNull()
      .$type<"github" | "local" | "well-known">(),
    version: text("version"),
    status: text("status").notNull().$type<SkillStatus>().default("installed"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - skill metadata from frontmatter
    metadata: jsonb("metadata").$type<Record<string, any> | null>(),
    installedAt: timestamp("installed_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_skills_user_id_idx").on(table.userId),
    userSkillUnique: uniqueIndex("user_skills_user_skill_unique").on(
      table.userId,
      table.skillName
    ),
  })
);

// Workflow executions table to track workflow runs
export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    workflowRunId: text("workflow_run_id"),
    status: text("status")
      .notNull()
      .$type<"pending" | "running" | "success" | "error" | "cancelled">(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    input: jsonb("input").$type<Record<string, any>>(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    output: jsonb("output").$type<any>(),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    duration: text("duration"), // Duration in milliseconds
  },
  (table) => ({
    workflowRunIdIdx: index("workflow_executions_workflow_run_id_idx").on(
      table.workflowRunId
    ),
  })
);

// Workflow execution logs to track individual node executions
export const workflowExecutionLogs = pgTable("workflow_execution_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  executionId: text("execution_id")
    .notNull()
    .references(() => workflowExecutions.id),
  nodeId: text("node_id").notNull(),
  nodeName: text("node_name").notNull(),
  nodeType: text("node_type").notNull(),
  status: text("status")
    .notNull()
    .$type<"pending" | "running" | "success" | "error">(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  input: jsonb("input").$type<any>(),
  // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
  output: jsonb("output").$type<any>(),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  duration: text("duration"), // Duration in milliseconds
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// API Keys table for webhook authentication
export const apiKeys = pgTable("api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name"), // Optional label for the API key
  keyHash: text("key_hash").notNull(), // Store hashed version of the key
  keyPrefix: text("key_prefix").notNull(), // Store first few chars for display (e.g., "wf_abc...")
  // Optional list of scopes. Empty or null means full access for backward compatibility.
  scopes: jsonb("scopes").$type<string[] | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export type ArtifactSource = "agent_manifest" | "agent_inferred";
export type ArtifactKind =
  | "file"
  | "image"
  | "video"
  | "audio"
  | "web_page"
  | "url"
  | "json"
  | "text"
  | "unknown";
export type ArtifactStorageProvider = "blob" | "external" | "inline";
export type ArtifactStatus = "ready" | "processing" | "failed";
export type ArtifactVisibility = "private" | "public";

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id),
    executionId: text("execution_id").references(() => workflowExecutions.id),
    executionLogId: text("execution_log_id").references(
      () => workflowExecutionLogs.id
    ),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    actionType: text("action_type"),
    source: text("source").notNull().$type<ArtifactSource>(),
    kind: text("kind").notNull().$type<ArtifactKind>(),
    title: text("title").notNull(),
    mimeType: text("mime_type"),
    extension: text("extension"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    storageProvider: text("storage_provider")
      .notNull()
      .$type<ArtifactStorageProvider>(),
    storageKey: text("storage_key"),
    blobUrl: text("blob_url"),
    inlineContent: text("inline_content"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    preview: jsonb("preview").$type<Record<string, any> | null>(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    metadata: jsonb("metadata").$type<Record<string, any> | null>(),
    status: text("status").notNull().$type<ArtifactStatus>(),
    visibility: text("visibility").notNull().$type<ArtifactVisibility>(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("artifacts_user_id_idx").on(table.userId),
    workflowIdIdx: index("artifacts_workflow_id_idx").on(table.workflowId),
    executionIdIdx: index("artifacts_execution_id_idx").on(table.executionId),
    createdAtIdx: index("artifacts_created_at_idx").on(table.createdAt),
  })
);

export type ArtifactPublicationVisibility = "unlisted" | "public";

export const artifactPublications = pgTable(
  "artifact_publications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    uiSpec: jsonb("ui_spec").$type<Record<string, any> | null>(),
    uiSpecVersion: text("ui_spec_version"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    uiMetadata: jsonb("ui_metadata").$type<Record<string, any> | null>(),
    visibility: text("visibility")
      .notNull()
      .$type<ArtifactPublicationVisibility>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    publishedAt: timestamp("published_at"),
  },
  (table) => ({
    artifactIdUnique: uniqueIndex(
      "artifact_publications_artifact_id_unique"
    ).on(table.artifactId),
    slugUnique: uniqueIndex("artifact_publications_slug_unique").on(table.slug),
    userIdIdx: index("artifact_publications_user_id_idx").on(table.userId),
  })
);

// Relations
export const workflowExecutionsRelations = relations(
  workflowExecutions,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowExecutions.workflowId],
      references: [workflows.id],
    }),
  })
);

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  user: one(users, {
    fields: [artifacts.userId],
    references: [users.id],
  }),
  workflow: one(workflows, {
    fields: [artifacts.workflowId],
    references: [workflows.id],
  }),
  execution: one(workflowExecutions, {
    fields: [artifacts.executionId],
    references: [workflowExecutions.id],
  }),
  executionLog: one(workflowExecutionLogs, {
    fields: [artifacts.executionLogId],
    references: [workflowExecutionLogs.id],
  }),
  publication: one(artifactPublications, {
    fields: [artifacts.id],
    references: [artifactPublications.artifactId],
  }),
}));

export const artifactPublicationsRelations = relations(
  artifactPublications,
  ({ one }) => ({
    artifact: one(artifacts, {
      fields: [artifactPublications.artifactId],
      references: [artifacts.id],
    }),
    user: one(users, {
      fields: [artifactPublications.userId],
      references: [users.id],
    }),
  })
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type OpencodeConnection = typeof opencodeConnections.$inferSelect;
export type NewOpencodeConnection = typeof opencodeConnections.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
export type WorkflowExecutionLog = typeof workflowExecutionLogs.$inferSelect;
export type NewWorkflowExecutionLog = typeof workflowExecutionLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type ArtifactPublication = typeof artifactPublications.$inferSelect;
export type NewArtifactPublication = typeof artifactPublications.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type UserSkill = typeof userSkills.$inferSelect;
export type NewUserSkill = typeof userSkills.$inferInsert;
