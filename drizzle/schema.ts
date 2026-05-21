import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, double, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Each time a user uploads files and runs the calculation, one session is created.
 */
export const uploadSessions = mysqlTable("upload_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionName: varchar("sessionName", { length: 255 }).notNull(),
  aoikumoFileName: varchar("aoikumoFileName", { length: 255 }),
  sequoiaFileName: varchar("sequoiaFileName", { length: 255 }),
  totalRecords: int("totalRecords").default(0).notNull(),
  totalExposure: double("totalExposure").default(0).notNull(),
  excludedAmount: double("excludedAmount").default(0).notNull(),
  afterExclusion: double("afterExclusion").default(0).notNull(),
  settledAmount: double("settledAmount").default(0).notNull(),
  finalRemaining: double("finalRemaining").default(0).notNull(),
  statusBreakdown: json("statusBreakdown"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UploadSession = typeof uploadSessions.$inferSelect;
export type InsertUploadSession = typeof uploadSessions.$inferInsert;

/**
 * Each row in the calculation result for a session.
 */
export const calculationRows = mysqlTable("calculation_rows", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  customerRef: varchar("customerRef", { length: 255 }).notNull(),
  item: varchar("item", { length: 255 }).notNull(),
  aoikumoOwing: double("aoikumoOwing").default(0).notNull(),
  aoikumoUnearned: double("aoikumoUnearned").default(0).notNull(),
  sequoiaBalance: double("sequoiaBalance").default(0).notNull(),
  sequoiaUnearned: double("sequoiaUnearned").default(0).notNull(),
  status: varchar("status", { length: 10 }).notNull(),
  statusReason: text("statusReason"),
  excludeFlag: mysqlEnum("excludeFlag", ["Y", "N"]).default("N").notNull(),
  settleFlag: mysqlEnum("settleFlag", ["Y", "N"]).default("N").notNull(),
  settlePct: double("settlePct").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CalculationRow = typeof calculationRows.$inferSelect;
export type InsertCalculationRow = typeof calculationRows.$inferInsert;