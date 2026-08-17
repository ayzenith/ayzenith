import "server-only";

import {
  Prisma,
  type ExpenseKind,
  type PaymentDirection,
  type PaymentMethod,
  type PaymentStatus,
  type RecurrenceFreq,
  type TaxStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { D, ZERO, money, toNum, toNumOrNull, type Dec } from "./money";
import { CASHFLOW_BUCKETS, type CashflowBucketKey } from "@/config/os";

/**
 * AYZENITH BUSINESS OS — money in, money out.
 *
 * One table, `Payment`, carries every expected and settled movement: receivables
 * from sales, payables to suppliers, overheads, tax obligations. Several rows
 * against one document ARE the instalment plan, which is why there is no
 * separate schedule model to keep in sync.
 *
 * "Overdue" is never stored. It is `dueDate < today AND status <> PAID`,
 * evaluated at read time — a stored flag would be wrong every morning until
 * something re-ran to fix it.
 *
 * Every total is computed in SQL as `SUM(amount * fxRate)`, so a receivable in
 * EUR and one in TRY add up through the rate each was booked at.
 */

// ---------------------------------------------------------------------------
// Cash-flow calendar
// ---------------------------------------------------------------------------

export type BucketTotals = Record<CashflowBucketKey, number>;

export type CashflowView = {
  incoming: BucketTotals;
  outgoing: BucketTotals;
  incomingCount: Record<CashflowBucketKey, number>;
  outgoingCount: Record<CashflowBucketKey, number>;
  baseCurrency: string;
};

function emptyBuckets(): BucketTotals {
  return Object.fromEntries(CASHFLOW_BUCKETS.map((b) => [b.key, 0])) as BucketTotals;
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * The 30 gün / 1–6 ay / 6–12 ay / 12+ ay view, both directions, in one query.
 * Only the OPEN portion counts: `amount - paidAmount`, so a half-collected
 * invoice shows only what is still owed.
 */
export async function getCashflow(baseCurrency: string): Promise<CashflowView> {
  const today = startOfDay();
  const rows = await db.$queryRaw<
    Array<{ direction: PaymentDirection; bucket: string; total: Prisma.Decimal | null; cnt: bigint }>
  >(Prisma.sql`
    SELECT "direction",
      CASE
        WHEN "dueDate" <  ${today}                 THEN 'overdue'
        WHEN "dueDate" <= ${addDays(today, 30)}    THEN 'd30'
        WHEN "dueDate" <= ${addDays(today, 183)}   THEN 'm1_6'
        WHEN "dueDate" <= ${addDays(today, 365)}   THEN 'm6_12'
        ELSE 'm12p'
      END AS "bucket",
      SUM(("amount" - "paidAmount") * "fxRate") AS "total",
      COUNT(*) AS "cnt"
    FROM "Payment"
    WHERE "status" IN ('PENDING','PARTIAL')
    GROUP BY "direction", 2
  `);

  const view: CashflowView = {
    incoming: emptyBuckets(),
    outgoing: emptyBuckets(),
    incomingCount: emptyBuckets() as unknown as Record<CashflowBucketKey, number>,
    outgoingCount: emptyBuckets() as unknown as Record<CashflowBucketKey, number>,
    baseCurrency,
  };
  for (const r of rows) {
    const key = r.bucket as CashflowBucketKey;
    if (r.direction === "IN") {
      view.incoming[key] = toNum(r.total);
      view.incomingCount[key] = Number(r.cnt);
    } else {
      view.outgoing[key] = toNum(r.total);
      view.outgoingCount[key] = Number(r.cnt);
    }
  }
  return view;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentRow = {
  id: string;
  direction: PaymentDirection;
  partyId: string | null;
  partyName: string | null;
  amount: number;
  paidAmount: number;
  open: number;
  currency: string;
  dueDate: Date;
  paidAt: Date | null;
  status: PaymentStatus;
  method: PaymentMethod | null;
  overdue: boolean;
  daysToDue: number;
  docCode: string | null;
  docHref: string | null;
  note: string | null;
};

export async function listPayments(opts: {
  direction?: PaymentDirection;
  status?: PaymentStatus;
  partyId?: string;
  overdueOnly?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
} = {}): Promise<{ rows: PaymentRow[]; total: number; page: number; perPage: number; openTotal: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 25));
  const today = startOfDay();

  const where: Prisma.PaymentWhereInput = {
    ...(opts.direction ? { direction: opts.direction } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.partyId ? { partyId: opts.partyId } : {}),
    ...(opts.overdueOnly
      ? { dueDate: { lt: today }, status: { in: ["PENDING", "PARTIAL"] } }
      : {}),
    ...(opts.from || opts.to
      ? { dueDate: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {}),
  };

  const [rows, total, openAgg] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, direction: true, amount: true, paidAmount: true, currency: true, fxRate: true,
        dueDate: true, paidAt: true, status: true, method: true, note: true,
        party: { select: { id: true, name: true } },
        sale: { select: { id: true, code: true } },
        purchase: { select: { id: true, code: true } },
        expense: { select: { id: true, title: true } },
        taxRecord: { select: { id: true, kind: true, period: true } },
      },
    }),
    db.payment.count({ where }),
    db.$queryRaw<Array<{ open: Prisma.Decimal | null }>>(Prisma.sql`
      SELECT SUM(("amount" - "paidAmount") * "fxRate") AS "open"
      FROM "Payment"
      WHERE "status" IN ('PENDING','PARTIAL')
        ${opts.direction ? Prisma.sql`AND "direction" = ${opts.direction}::"PaymentDirection"` : Prisma.empty}
        ${opts.partyId ? Prisma.sql`AND "partyId" = ${opts.partyId}` : Prisma.empty}
        ${opts.overdueOnly ? Prisma.sql`AND "dueDate" < ${today}` : Prisma.empty}
    `),
  ]);

  return {
    total, page, perPage,
    openTotal: toNum(openAgg[0]?.open ?? null),
    rows: rows.map((p) => {
      const amount = toNum(p.amount);
      const paid = toNum(p.paidAmount);
      const open = amount - paid;
      const docCode =
        p.sale?.code ??
        p.purchase?.code ??
        p.expense?.title ??
        (p.taxRecord ? `${p.taxRecord.kind} ${p.taxRecord.period}` : null);
      const docHref = p.sale
        ? `/os/sales/${p.sale.id}`
        : p.purchase
          ? `/os/purchases/${p.purchase.id}`
          : p.expense
            ? "/os/expenses"
            : p.taxRecord
              ? "/os/tax"
              : null;
      return {
        id: p.id,
        direction: p.direction,
        partyId: p.party?.id ?? null,
        partyName: p.party?.name ?? null,
        amount, paidAmount: paid, open,
        currency: p.currency,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        status: p.status,
        method: p.method,
        overdue: p.status !== "PAID" && p.status !== "CANCELLED" && p.dueDate < today,
        daysToDue: Math.round((p.dueDate.getTime() - today.getTime()) / 86_400_000),
        docCode, docHref,
        note: p.note,
      };
    }),
  };
}

/**
 * Record money moving. A partial amount leaves the row PARTIAL with the rest
 * still open; paying the balance closes it. Amounts are never overwritten —
 * `paidAmount` accumulates, so the history of a slow payer stays readable.
 */
export async function settlePayment(input: {
  id: string;
  amount: Dec;
  paidAt?: Date;
  method?: PaymentMethod | null;
  reference?: string | null;
  userId?: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: input.id } });
    if (!p) throw new Error("Ödeme kaydı bulunamadı.");
    if (p.status === "CANCELLED") throw new Error("İptal edilmiş bir kayıt tahsil edilemez.");

    const newPaid = money(p.paidAmount.plus(input.amount));
    if (newPaid.lt(0)) throw new Error("Ödenen tutar eksiye düşemez.");
    const status: PaymentStatus = newPaid.gte(p.amount) ? "PAID" : newPaid.gt(0) ? "PARTIAL" : "PENDING";

    await tx.payment.update({
      where: { id: input.id },
      data: {
        paidAmount: newPaid,
        status,
        paidAt: status === "PAID" ? (input.paidAt ?? new Date()) : p.paidAt,
        method: input.method ?? p.method,
        reference: input.reference?.trim() || p.reference,
      },
    });

    // A fully-settled document is COMPLETED, so the sales list can show at a
    // glance which jobs are actually finished rather than merely delivered.
    for (const [docId, kind] of [
      [p.saleId, "sale"],
      [p.purchaseId, "purchase"],
    ] as const) {
      if (!docId) continue;
      const open = await tx.payment.count({
        where: {
          ...(kind === "sale" ? { saleId: docId } : { purchaseId: docId }),
          status: { in: ["PENDING", "PARTIAL"] },
        },
      });
      if (open === 0) {
        if (kind === "sale") await tx.sale.updateMany({ where: { id: docId, status: "CONFIRMED" }, data: { status: "COMPLETED" } });
        else await tx.purchase.updateMany({ where: { id: docId, status: "CONFIRMED" }, data: { status: "COMPLETED" } });
      }
    }
  });

  await logActivity({
    userId: input.userId ?? null,
    action: "os.payment.settle",
    entity: "Payment",
    entityId: input.id,
    summary: `Tahsilat/ödeme kaydedildi: ${input.amount.toString()}`,
  });
}

/** A standalone receivable/payable not tied to a document (an advance, a loan). */
export async function createPayment(input: {
  direction: PaymentDirection;
  partyId?: string | null;
  amount: Dec;
  currency: string;
  fxRate: Dec;
  dueDate: Date;
  method?: PaymentMethod | null;
  note?: string | null;
  userId?: string | null;
}): Promise<string> {
  const row = await db.payment.create({
    data: {
      direction: input.direction,
      partyId: input.partyId || null,
      amount: input.amount,
      currency: input.currency,
      fxRate: input.fxRate,
      fxRateDate: new Date(),
      dueDate: input.dueDate,
      method: input.method ?? null,
      note: input.note?.trim() || null,
      createdById: input.userId ?? null,
    },
    select: { id: true },
  });
  await logActivity({
    userId: input.userId ?? null,
    action: "os.payment.create",
    entity: "Payment",
    entityId: row.id,
    summary: `${input.direction === "IN" ? "Tahsilat" : "Ödeme"} planı eklendi`,
  });
  return row.id;
}

export async function cancelPayment(id: string, userId?: string | null): Promise<void> {
  await db.payment.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({
    userId: userId ?? null,
    action: "os.payment.cancel",
    entity: "Payment",
    entityId: id,
    summary: "Ödeme kaydı iptal edildi",
  });
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function listExpenses(opts: {
  kind?: ExpenseKind;
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
} = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(10, opts.perPage ?? 25));
  const where: Prisma.ExpenseWhereInput = {
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.from || opts.to
      ? { occurredAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {}),
  };
  const [rows, total, agg] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, title: true, kind: true, amount: true, currency: true, fxRate: true,
        occurredAt: true, dueDate: true, note: true, recurringId: true, periodKey: true,
        party: { select: { id: true, name: true } },
        payments: { select: { status: true, paidAmount: true, amount: true } },
      },
    }),
    db.expense.count({ where }),
    db.$queryRaw<Array<{ total: Prisma.Decimal | null }>>(Prisma.sql`
      SELECT SUM("amount" * "fxRate") AS "total" FROM "Expense"
      WHERE TRUE
        ${opts.kind ? Prisma.sql`AND "kind" = ${opts.kind}::"ExpenseKind"` : Prisma.empty}
        ${opts.from ? Prisma.sql`AND "occurredAt" >= ${opts.from}` : Prisma.empty}
        ${opts.to ? Prisma.sql`AND "occurredAt" <= ${opts.to}` : Prisma.empty}
    `),
  ]);
  return {
    total, page, perPage,
    baseTotal: toNum(agg[0]?.total ?? null),
    rows: rows.map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      amount: toNum(e.amount),
      currency: e.currency,
      baseAmount: toNum(e.amount.mul(e.fxRate)),
      occurredAt: e.occurredAt,
      dueDate: e.dueDate,
      note: e.note,
      recurring: Boolean(e.recurringId),
      periodKey: e.periodKey,
      partyName: e.party?.name ?? null,
      paid: e.payments.length > 0 && e.payments.every((p) => p.status === "PAID"),
    })),
  };
}

/** Create an overhead and its outgoing payment in one step. */
export async function createExpense(input: {
  title: string;
  kind: ExpenseKind;
  partyId?: string | null;
  amount: Dec;
  currency: string;
  fxRate: Dec;
  occurredAt?: Date;
  dueDate?: Date | null;
  note?: string | null;
  userId?: string | null;
}): Promise<string> {
  const occurredAt = input.occurredAt ?? new Date();
  const id = await db.$transaction(async (tx) => {
    const e = await tx.expense.create({
      data: {
        title: input.title.trim(),
        kind: input.kind,
        partyId: input.partyId || null,
        amount: input.amount,
        currency: input.currency,
        fxRate: input.fxRate,
        fxRateDate: occurredAt,
        occurredAt,
        dueDate: input.dueDate ?? null,
        note: input.note?.trim() || null,
        createdById: input.userId ?? null,
      },
      select: { id: true },
    });
    await tx.payment.create({
      data: {
        direction: "OUT",
        partyId: input.partyId || null,
        expenseId: e.id,
        amount: input.amount,
        currency: input.currency,
        fxRate: input.fxRate,
        fxRateDate: occurredAt,
        dueDate: input.dueDate ?? occurredAt,
        note: input.title.trim(),
        createdById: input.userId ?? null,
      },
    });
    return e.id;
  });
  await logActivity({
    userId: input.userId ?? null,
    action: "os.expense.create",
    entity: "Expense",
    entityId: id,
    summary: `Gider: ${input.title}`,
  });
  return id;
}

export async function deleteExpense(id: string, userId?: string | null): Promise<void> {
  await db.expense.delete({ where: { id } });
  await logActivity({
    userId: userId ?? null,
    action: "os.expense.delete",
    entity: "Expense",
    entityId: id,
    summary: "Gider silindi",
  });
}

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

export async function listRecurring() {
  const rows = await db.recurringExpense.findMany({
    orderBy: [{ active: "desc" }, { title: "asc" }],
    select: {
      id: true, title: true, kind: true, amount: true, currency: true, frequency: true,
      dayOfMonth: true, startsAt: true, endsAt: true, active: true, note: true,
      party: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ ...r, amount: toNum(r.amount), partyName: r.party?.name ?? null }));
}

export async function upsertRecurring(input: {
  id?: string;
  title: string;
  kind: ExpenseKind;
  partyId?: string | null;
  amount: Dec;
  currency: string;
  frequency: RecurrenceFreq;
  dayOfMonth: number;
  startsAt: Date;
  endsAt?: Date | null;
  active?: boolean;
  note?: string | null;
}) {
  const data = {
    title: input.title.trim(),
    kind: input.kind,
    partyId: input.partyId || null,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    // Clamped to 28 so February exists too — the schema promises this.
    dayOfMonth: Math.min(28, Math.max(1, input.dayOfMonth)),
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    note: input.note?.trim() || null,
    ...(input.active === undefined ? {} : { active: input.active }),
  };
  return input.id
    ? db.recurringExpense.update({ where: { id: input.id }, data })
    : db.recurringExpense.create({ data });
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurringExpense.delete({ where: { id } });
}

function periodKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Roll standing costs forward into real Expense + Payment rows, up to `months`
 * ahead, so rent and salaries appear in the cash-flow calendar next to invoices.
 *
 * Idempotent: `Expense` is unique on (recurringId, periodKey), so running this on
 * every finance page load can never create September's rent twice.
 */
export async function materialiseRecurring(monthsAhead = 12): Promise<number> {
  const now = startOfDay();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + monthsAhead);

  const rules = await db.recurringExpense.findMany({ where: { active: true } });
  let created = 0;

  for (const rule of rules) {
    const cursor = new Date(Math.max(rule.startsAt.getTime(), now.getTime()));
    cursor.setHours(0, 0, 0, 0);

    // Step to the first occurrence on or after `cursor`.
    const dates: Date[] = [];
    const step = { WEEKLY: 0, MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[rule.frequency];
    if (rule.frequency === "WEEKLY") {
      const d = new Date(cursor);
      while (d <= horizon && (!rule.endsAt || d <= rule.endsAt)) {
        dates.push(new Date(d));
        d.setDate(d.getDate() + 7);
      }
    } else {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), rule.dayOfMonth);
      if (d < cursor) d.setMonth(d.getMonth() + step);
      while (d <= horizon && (!rule.endsAt || d <= rule.endsAt)) {
        dates.push(new Date(d));
        d.setMonth(d.getMonth() + step);
      }
    }

    for (const date of dates) {
      const periodKey = periodKeyOf(date);
      const exists = await db.expense.findUnique({
        where: { recurringId_periodKey: { recurringId: rule.id, periodKey } },
        select: { id: true },
      });
      if (exists) continue;
      await db.$transaction(async (tx) => {
        const e = await tx.expense.create({
          data: {
            title: rule.title,
            kind: rule.kind,
            partyId: rule.partyId,
            amount: rule.amount,
            currency: rule.currency,
            fxRate: D(1),
            fxRateDate: date,
            occurredAt: date,
            dueDate: date,
            recurringId: rule.id,
            periodKey,
            note: rule.note,
          },
          select: { id: true },
        });
        await tx.payment.create({
          data: {
            direction: "OUT",
            partyId: rule.partyId,
            expenseId: e.id,
            amount: rule.amount,
            currency: rule.currency,
            fxRate: D(1),
            fxRateDate: date,
            dueDate: date,
            note: rule.title,
          },
        });
      });
      created += 1;
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Tax diary
// ---------------------------------------------------------------------------

export async function listTaxRecords(opts: { status?: TaxStatus; year?: number } = {}) {
  const where: Prisma.TaxRecordWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.year
      ? { dueDate: { gte: new Date(opts.year, 0, 1), lt: new Date(opts.year + 1, 0, 1) } }
      : {}),
  };
  const rows = await db.taxRecord.findMany({ where, orderBy: { dueDate: "asc" } });
  const today = startOfDay();
  return rows.map((t) => ({
    id: t.id,
    kind: t.kind,
    period: t.period,
    amount: toNumOrNull(t.amount),
    currency: t.currency,
    dueDate: t.dueDate,
    status: t.status,
    paidAt: t.paidAt,
    note: t.note,
    overdue: t.status !== "PAID" && t.status !== "CANCELLED" && t.dueDate < today,
  }));
}

/**
 * Record — never compute — a tax obligation. Business OS applies no legislation
 * and asserts no liability; this is a diary entry with a due date so the money
 * shows up in cash flow. Creating one with an amount also creates its payable.
 */
export async function upsertTaxRecord(input: {
  id?: string;
  kind: string;
  period: string;
  amount?: Dec | null;
  currency: string;
  dueDate: Date;
  status?: TaxStatus;
  note?: string | null;
  userId?: string | null;
}): Promise<string> {
  const id = await db.$transaction(async (tx) => {
    const data = {
      kind: input.kind.trim(),
      period: input.period.trim(),
      amount: input.amount ?? null,
      currency: input.currency,
      dueDate: input.dueDate,
      status: input.status ?? "PLANNED",
      note: input.note?.trim() || null,
    };
    const row = input.id
      ? await tx.taxRecord.update({ where: { id: input.id }, data })
      : await tx.taxRecord.upsert({
          where: { kind_period: { kind: data.kind, period: data.period } },
          create: data,
          update: data,
        });

    // Keep exactly one open payable in step with the record.
    await tx.payment.deleteMany({
      where: { taxRecordId: row.id, status: { in: ["PENDING", "PARTIAL"] } },
    });
    if (input.amount && input.amount.gt(0) && data.status !== "CANCELLED" && data.status !== "PAID") {
      await tx.payment.create({
        data: {
          direction: "OUT",
          taxRecordId: row.id,
          amount: input.amount,
          currency: input.currency,
          fxRate: D(1),
          fxRateDate: input.dueDate,
          dueDate: input.dueDate,
          note: `${data.kind} ${data.period}`,
          createdById: input.userId ?? null,
        },
      });
    }
    return row.id;
  });
  await logActivity({
    userId: input.userId ?? null,
    action: "os.tax.upsert",
    entity: "TaxRecord",
    entityId: id,
    summary: `Vergi kaydı: ${input.kind} ${input.period}`,
  });
  return id;
}

export async function markTaxPaid(id: string, paidAt: Date, userId?: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.taxRecord.update({ where: { id }, data: { status: "PAID", paidAt } });
    const pending = await tx.payment.findMany({
      where: { taxRecordId: id, status: { in: ["PENDING", "PARTIAL"] } },
      select: { id: true, amount: true },
    });
    for (const p of pending) {
      await tx.payment.update({
        where: { id: p.id },
        data: { paidAmount: p.amount, status: "PAID", paidAt },
      });
    }
  });
  await logActivity({
    userId: userId ?? null,
    action: "os.tax.paid",
    entity: "TaxRecord",
    entityId: id,
    summary: "Vergi ödendi olarak işaretlendi",
  });
}

export async function deleteTaxRecord(id: string): Promise<void> {
  await db.taxRecord.delete({ where: { id } });
}

export { ZERO, startOfDay, addDays };
