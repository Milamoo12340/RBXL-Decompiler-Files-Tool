import { pgTable, text, integer, boolean, timestamp, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Decompile Sessions ────────────────────────────────────────────────────────

export const decompilesessions = pgTable("decompile_sessions", {
  id: serial("id").primaryKey(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  status: text("status").notNull().default("pending"),
  scriptCount: integer("script_count").notNull().default(0),
  errorMessage: text("error_message"),
  fileSizeBytes: integer("file_size_bytes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDecompileSessionSchema = createInsertSchema(decompilesessions).omit({ id: true, createdAt: true });
export type InsertDecompileSession = z.infer<typeof insertDecompileSessionSchema>;
export type DecompileSession = typeof decompilesessions.$inferSelect;

// ── Scripts ───────────────────────────────────────────────────────────────────

export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => decompilesessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  scriptType: text("script_type").notNull(), // Script | LocalScript | ModuleScript
  scriptPath: text("script_path").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  content: text("content").notNull().default(""),
  isBytecode: boolean("is_bytecode").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScriptSchema = createInsertSchema(scripts).omit({ id: true, createdAt: true });
export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

// ── Topics ────────────────────────────────────────────────────────────────────

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => decompilesessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(), // hatch_chances | egg_rates | pets | game_mechanics | currencies | shops | events | other
  matchCount: integer("match_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTopicSchema = createInsertSchema(topics).omit({ id: true, createdAt: true });
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;

// ── Topic Findings ────────────────────────────────────────────────────────────

export const topicFindings = pgTable("topic_findings", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").notNull(),
  scriptId: integer("script_id").notNull(),
  scriptName: text("script_name").notNull(),
  lineNumber: integer("line_number").notNull().default(0),
  snippet: text("snippet").notNull(),
  value: text("value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TopicFinding = typeof topicFindings.$inferSelect;
