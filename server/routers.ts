import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createUploadSession,
  updateUploadSession,
  getUploadSessions,
  getUploadSessionById,
  deleteUploadSession,
  insertCalculationRows,
  getCalculationRowsBySession,
  updateCalculationRow,
} from "./db";

// ─── CSV Parsing & Classification Logic ──────────────────────────────────────

export function parseCSVText(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;
  let fieldWasQuoted = false;
  let fieldHasContent = false;

  const pushField = () => {
    currentRow.push(fieldWasQuoted ? currentField : currentField.trim());
    currentField = "";
    fieldWasQuoted = false;
    fieldHasContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (!inQuotes && !fieldHasContent && currentField.trim() === "") {
        // Starting a quoted field.
        currentField = "";
        inQuotes = true;
        fieldWasQuoted = true;
        fieldHasContent = true;
        continue;
      }

      if (inQuotes) {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        // Quote in an unquoted field should be preserved as-is.
        currentField += '"';
        fieldHasContent = true;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      pushField();

      if (currentRow.some((v) => v !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
    if (char !== " " && char !== "\t") {
      fieldHasContent = true;
    }
  }

  // Flush last row/field
  pushField();
  if (currentRow.some((v) => v !== "")) {
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  const headers = (rows[0] ?? []).map((h, idx) =>
    idx === 0 ? h.replace(/^\uFEFF/, "").trim() : h.trim()
  );

  return rows.slice(1).map((values) => {
    const row: Record<string, string> = {};

    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });

    return row;
  });
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

function toNum(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

interface AoikumoRecord {
  customer_ref: string;
  item: string;
  owing: number;
  unearned: number;
}

interface SequoiaRecord {
  customer_ref: string;
  item: string;
  balance: number;
  unearned: number;
}

interface MatchedRecord {
  customer_ref: string;
  item: string;
  aoikumo_owing: number;
  aoikumo_unearned: number;
  sequoia_balance: number;
  sequoia_unearned: number;
  status: string;
  status_reason: string;
  exclude_default: boolean;
}

function matchAndClassify(
  aoikumo: AoikumoRecord[],
  sequoia: SequoiaRecord[]
): MatchedRecord[] {
  const seqMap = new Map<string, SequoiaRecord>();
  sequoia.forEach((r) => seqMap.set(`${r.customer_ref}|${r.item}`, r));

  return aoikumo.map((a) => {
    const key = `${a.customer_ref}|${a.item}`;
    const s = seqMap.get(key);

    let status = "D";
    let status_reason = "Not found in Sequoia";
    let exclude_default = false;

    if (s) {
      const seqZero = Math.abs(s.balance) < 0.01 && Math.abs(s.unearned) < 0.01;
      const aoikumoOpen = Math.abs(a.owing) > 0.01 || Math.abs(a.unearned) > 0.01;

      if (seqZero && aoikumoOpen) {
        status = "A";
        status_reason = "Sequoia zero, Aoikumo still open — recommend exclude";
        exclude_default = true;
      } else if (!seqZero && aoikumoOpen) {
        const diff = Math.abs(a.owing - s.balance);
        if (diff < 0.01) {
          status = "B";
          status_reason = "Amounts match — review";
        } else {
          status = "C";
          status_reason = `Amount mismatch (Aoikumo: ${a.owing.toFixed(2)}, Sequoia: ${s.balance.toFixed(2)})`;
        }
      } else {
        status = "D";
        status_reason = "Both systems show zero or minimal balance";
      }
    }

    return {
      customer_ref: a.customer_ref,
      item: a.item,
      aoikumo_owing: a.owing,
      aoikumo_unearned: a.unearned,
      sequoia_balance: s?.balance ?? 0,
      sequoia_unearned: s?.unearned ?? 0,
      status,
      status_reason,
      exclude_default,
    };
  });
}

function recalcSummary(
  rows: Array<{
    aoikumo_owing: number;
    status: string;
    excludeFlag: string;
    settleFlag: string;
    settlePct: number;
  }>
) {
  let totalExposure = 0;
  let excludedAmount = 0;
  let settledAmount = 0;
  const byStatus: Record<string, { count: number; amount: number }> = {};

  rows.forEach((r) => {
    totalExposure += r.aoikumo_owing;
    if (!byStatus[r.status]) byStatus[r.status] = { count: 0, amount: 0 };
    byStatus[r.status].count++;
    byStatus[r.status].amount += r.aoikumo_owing;

    if (r.excludeFlag === "Y") {
      excludedAmount += r.aoikumo_owing;
    } else if (r.settleFlag === "Y") {
      settledAmount += r.aoikumo_owing * (r.settlePct / 100);
    }
  });

  const afterExclusion = totalExposure - excludedAmount;
  const finalRemaining = afterExclusion - settledAmount;

  return { totalExposure, excludedAmount, afterExclusion, settledAmount, finalRemaining, byStatus };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  unearned: router({
    processFiles: publicProcedure
      .input(
        z.object({
          sessionName: z.string().min(1),
          aoikumoFileName: z.string().optional(),
          sequoiaFileName: z.string().optional(),
          aoikumoCsv: z.string(),
          sequoiaCsv: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const aoikumoRaw = parseCSVText(input.aoikumoCsv);
        const sequoiaRaw = parseCSVText(input.sequoiaCsv);

        const aoikumoRecords: AoikumoRecord[] = aoikumoRaw.map((r) => ({
          customer_ref: getField(r, "customer_ref", "Customer Ref", "CustomerRef"),
          item: getField(r, "item", "Item"),
          owing: toNum(getField(r, "owing", "Owing", "Company Owing", "Customer Owing")),
          unearned: toNum(getField(r, "unearned", "Unearned")),
        }));

        const sequoiaRecords: SequoiaRecord[] = sequoiaRaw.map((r) => ({
          customer_ref: getField(r, "customer_ref", "Customer Ref", "CustomerRef"),
          item: getField(r, "item", "Item"),
          balance: toNum(getField(r, "balance", "Balance", "Unearned Balance")),
          unearned: toNum(getField(r, "unearned", "Unearned")),
        }));

        const matched = matchAndClassify(aoikumoRecords, sequoiaRecords);
        const summary = recalcSummary(
          matched.map((m) => ({
            aoikumo_owing: m.aoikumo_owing,
            status: m.status,
            excludeFlag: m.exclude_default ? "Y" : "N",
            settleFlag: "N",
            settlePct: 0,
          }))
        );

        const sessionId = await createUploadSession({
          sessionName: input.sessionName,
          aoikumoFileName: input.aoikumoFileName,
          sequoiaFileName: input.sequoiaFileName,
          totalRecords: matched.length,
          totalExposure: summary.totalExposure,
          excludedAmount: summary.excludedAmount,
          afterExclusion: summary.afterExclusion,
          settledAmount: summary.settledAmount,
          finalRemaining: summary.finalRemaining,
          statusBreakdown: summary.byStatus,
        });

        await insertCalculationRows(
          matched.map((m) => ({
            sessionId,
            customerRef: m.customer_ref,
            item: m.item,
            aoikumoOwing: m.aoikumo_owing,
            aoikumoUnearned: m.aoikumo_unearned,
            sequoiaBalance: m.sequoia_balance,
            sequoiaUnearned: m.sequoia_unearned,
            status: m.status,
            statusReason: m.status_reason,
            excludeFlag: m.exclude_default ? "Y" : "N",
            settleFlag: "N",
            settlePct: 0,
          }))
        );

        return { sessionId, totalRecords: matched.length, summary };
      }),

    listSessions: publicProcedure.query(async () => {
      return getUploadSessions();
    }),

    getSession: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        const session = await getUploadSessionById(input.sessionId);
        if (!session) throw new Error("Session not found");
        const rows = await getCalculationRowsBySession(input.sessionId);
        return { session, rows };
      }),

    updateRow: publicProcedure
      .input(
        z.object({
          rowId: z.number(),
          sessionId: z.number(),
          excludeFlag: z.enum(["Y", "N"]).optional(),
          settleFlag: z.enum(["Y", "N"]).optional(),
          settlePct: z.number().min(0).max(100).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { rowId, sessionId, ...data } = input;
        await updateCalculationRow(rowId, data);

        const rows = await getCalculationRowsBySession(sessionId);
        const summary = recalcSummary(
          rows.map((r) => ({
            aoikumo_owing: r.aoikumoOwing,
            status: r.status,
            excludeFlag: r.excludeFlag,
            settleFlag: r.settleFlag,
            settlePct: r.settlePct,
          }))
        );

        await updateUploadSession(sessionId, {
          excludedAmount: summary.excludedAmount,
          afterExclusion: summary.afterExclusion,
          settledAmount: summary.settledAmount,
          finalRemaining: summary.finalRemaining,
          statusBreakdown: summary.byStatus,
        });

        return { summary };
      }),

    deleteSession: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteUploadSession(input.sessionId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
