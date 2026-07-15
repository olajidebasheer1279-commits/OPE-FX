import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, accountsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getOrCreateDefaultAccount,
  recalculateBalance,
  toAccountNumber,
} from "../lib/accounts";

const router: IRouter = Router();

function parseOptionalNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return isNaN(n) ? undefined : n;
}

/** GET /account — returns account + user profile */
router.get("/account", requireAuth, async (req, res): Promise<void> => {
  try {
    const account = await getOrCreateDefaultAccount(req.userId!);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);

    res.json({
      id: account.id,
      name: account.name,
      broker: account.broker ?? null,
      currency: account.currency,
      accountType: account.accountType ?? "live",
      timezone: account.timezone ?? "UTC",
      startingBalance: toAccountNumber(account.startingBalance),
      currentBalance: toAccountNumber(account.currentBalance),
      defaultRiskPercent: account.defaultRiskPercent
        ? toAccountNumber(account.defaultRiskPercent)
        : null,
      defaultLotSize: account.defaultLotSize
        ? toAccountNumber(account.defaultLotSize)
        : null,
      userName: user?.name ?? null,
      userEmail: user?.email ?? "",
      userAvatarUrl: user?.avatarUrl ?? null,
      createdAt: account.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching account");
    res.status(500).json({ error: "Failed to fetch account" });
  }
});

/** PATCH /account — update account settings */
router.patch("/account", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  try {
    const account = await getOrCreateDefaultAccount(req.userId!);

    // Validate and extract account fields
    const accountUpdate: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.length === 0) {
        res.status(400).json({ error: "Invalid name" });
        return;
      }
      accountUpdate.name = body.name;
    }
    if (body.broker !== undefined) {
      accountUpdate.broker = body.broker === null ? null : String(body.broker);
    }
    if (body.currency !== undefined) {
      accountUpdate.currency = String(body.currency);
    }
    if (body.accountType !== undefined) {
      const validTypes = ["live", "demo", "prop"];
      if (!validTypes.includes(body.accountType as string)) {
        res.status(400).json({ error: "Invalid accountType" });
        return;
      }
      accountUpdate.accountType = body.accountType;
    }
    if (body.timezone !== undefined) {
      accountUpdate.timezone = String(body.timezone);
    }

    const drisk = parseOptionalNumber(body.defaultRiskPercent);
    if (drisk !== undefined) {
      accountUpdate.defaultRiskPercent = drisk !== null ? drisk.toString() : null;
    }

    const dlot = parseOptionalNumber(body.defaultLotSize);
    if (dlot !== undefined) {
      accountUpdate.defaultLotSize = dlot !== null ? dlot.toString() : null;
    }

    const sb = parseOptionalNumber(body.startingBalance);
    const cbOverride = parseOptionalNumber(body.currentBalance);

    if (sb !== undefined && sb !== null) {
      accountUpdate.startingBalance = sb.toFixed(2);
    }
    if (cbOverride !== undefined && cbOverride !== null) {
      accountUpdate.currentBalance = cbOverride.toFixed(2);
    }

    if (Object.keys(accountUpdate).length > 0) {
      await db
        .update(accountsTable)
        .set(accountUpdate as Record<string, unknown>)
        .where(eq(accountsTable.id, account.id));

      // If starting balance changed (but not an explicit currentBalance override), recompute
      if (sb !== undefined && sb !== null && cbOverride === undefined) {
        await recalculateBalance(account.id);
      }
    }

    // Update user name if provided
    if (body.userName !== undefined) {
      await db
        .update(usersTable)
        .set({ name: body.userName === null ? null : String(body.userName) })
        .where(eq(usersTable.id, req.userId!));
    }

    // Fetch updated values
    const [updatedAccount] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, account.id))
      .limit(1);
    const [updatedUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);

    res.json({
      id: updatedAccount.id,
      name: updatedAccount.name,
      broker: updatedAccount.broker ?? null,
      currency: updatedAccount.currency,
      accountType: updatedAccount.accountType ?? "live",
      timezone: updatedAccount.timezone ?? "UTC",
      startingBalance: toAccountNumber(updatedAccount.startingBalance),
      currentBalance: toAccountNumber(updatedAccount.currentBalance),
      defaultRiskPercent: updatedAccount.defaultRiskPercent
        ? toAccountNumber(updatedAccount.defaultRiskPercent)
        : null,
      defaultLotSize: updatedAccount.defaultLotSize
        ? toAccountNumber(updatedAccount.defaultLotSize)
        : null,
      userName: updatedUser?.name ?? null,
      userEmail: updatedUser?.email ?? "",
      userAvatarUrl: updatedUser?.avatarUrl ?? null,
      createdAt: updatedAccount.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating account");
    res.status(500).json({ error: "Failed to update account" });
  }
});

export default router;
