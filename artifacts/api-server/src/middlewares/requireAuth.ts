import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const claimsUserId =
    typeof auth?.sessionClaims?.userId === "string"
      ? auth.sessionClaims.userId
      : undefined;
  const userId = claimsUserId ?? auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = userId;

  // JIT-provision a local user row keyed by the Clerk user id, so
  // authenticated data (accounts, trades, etc.) always has a valid owner.
  try {
    const claims = auth.sessionClaims as
      | { email?: string; name?: string; picture?: string }
      | undefined;

    await db
      .insert(usersTable)
      .values({
        id: userId,
        email: claims?.email ?? `${userId}@unknown.local`,
        name: claims?.name ?? null,
        avatarUrl: claims?.picture ?? null,
      })
      .onConflictDoNothing({ target: usersTable.id });
  } catch (err) {
    req.log.error({ err }, "Failed to JIT-provision user");
  }

  next();
}
