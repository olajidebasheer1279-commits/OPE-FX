import { eq } from "drizzle-orm";
import { db, accountsTable, type Account } from "@workspace/db";

const DEFAULT_STARTING_BALANCE = 10000;

/**
 * Returns the user's primary (first-created) trading account, creating a
 * default one on first use. Foundation/Dashboard did not ship account
 * management UI, so every authenticated user is JIT-provisioned a single
 * default account the first time they touch trade/journal/rule data.
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
      startingBalance: DEFAULT_STARTING_BALANCE.toString(),
      currentBalance: DEFAULT_STARTING_BALANCE.toString(),
    })
    .returning();

  return created;
}
