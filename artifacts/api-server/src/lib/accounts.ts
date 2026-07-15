import { and, eq, isNotNull, sum } from "drizzle-orm";
import { db, accountsTable, tradesTable, type Account } from "@workspace/db";

const DEFAULT_STARTING_BALANCE = 10000;

/**
 * Returns the user's primary (first-created) trading account, creating a
 * default one on first use.
 */
export async function getOrCreateDefaultAccount(
  userId: string,
): Promise<Account> {
  const [existing] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(accountsTable.createdAt)
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(accountsTable)
    .values({
      userId,
      name: "Primary Account",
      currency: "USD",
      accountType: "live",
      timezone: "UTC",
      startingBalance: DEFAULT_STARTING_BALANCE.toString(),
      currentBalance: DEFAULT_STARTING_BALANCE.toString(),
    })
    .returning();

  return created;
}

/**
 * Recomputes currentBalance from scratch as startingBalance + sum(all closed PnL).
 * Call this after any trade create/update/delete to prevent balance drift.
 */
export async function recalculateBalance(accountId: number): Promise<void> {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId))
    .limit(1);

  if (!account) return;

  const [result] = await db
    .select({ total: sum(tradesTable.pnl) })
    .from(tradesTable)
    .where(
      and(eq(tradesTable.accountId, accountId), isNotNull(tradesTable.pnl)),
    );

  const totalPnl = parseFloat(result?.total ?? "0") || 0;
  const newBalance = parseFloat(account.startingBalance) + totalPnl;

  await db
    .update(accountsTable)
    .set({ currentBalance: newBalance.toFixed(2) })
    .where(eq(accountsTable.id, accountId));
}

export function toAccountNumber(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}
