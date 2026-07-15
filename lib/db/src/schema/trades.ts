import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { accountsTable } from "./accounts";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accountsTable.id),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // "long" | "short"
  status: text("status").notNull().default("open"), // "open" | "closed"
  entryPrice: numeric("entry_price", { precision: 14, scale: 5 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 14, scale: 5 }),
  stopLoss: numeric("stop_loss", { precision: 14, scale: 5 }),
  takeProfit: numeric("take_profit", { precision: 14, scale: 5 }),
  lotSize: numeric("lot_size", { precision: 10, scale: 2 }).notNull(),
  pnl: numeric("pnl", { precision: 14, scale: 2 }),
  riskRewardRatio: numeric("risk_reward_ratio", { precision: 6, scale: 2 }),
  notes: text("notes"),
  tags: text("tags").array(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
