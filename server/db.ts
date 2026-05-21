import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  uploadSessions,
  calculationRows,
  InsertUploadSession,
  InsertCalculationRow,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Upload Sessions ──────────────────────────────────────────────────────────

export async function createUploadSession(data: InsertUploadSession): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(uploadSessions).values(data);
  return (result as any)[0].insertId as number;
}

export async function updateUploadSession(
  id: number,
  data: Partial<InsertUploadSession>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(uploadSessions).set(data).where(eq(uploadSessions.id, id));
}

export async function getUploadSessions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadSessions).orderBy(desc(uploadSessions.createdAt)).limit(50);
}

export async function getUploadSessionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(uploadSessions).where(eq(uploadSessions.id, id)).limit(1);
  return result[0];
}

export async function deleteUploadSession(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(calculationRows).where(eq(calculationRows.sessionId, id));
  await db.delete(uploadSessions).where(eq(uploadSessions.id, id));
}

// ─── Calculation Rows ─────────────────────────────────────────────────────────

export async function insertCalculationRows(rows: InsertCalculationRow[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(calculationRows).values(rows.slice(i, i + 100));
  }
}

export async function getCalculationRowsBySession(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(calculationRows)
    .where(eq(calculationRows.sessionId, sessionId))
    .orderBy(calculationRows.customerRef, calculationRows.item);
}

export async function updateCalculationRow(
  id: number,
  data: { excludeFlag?: "Y" | "N"; settleFlag?: "Y" | "N"; settlePct?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(calculationRows).set(data).where(eq(calculationRows.id, id));
}
