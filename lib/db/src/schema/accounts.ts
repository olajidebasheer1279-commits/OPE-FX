import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  name: text("name").notNull(),
  broker: text("broker"),
  currency: text("currency").notNull().default("USD"),
  accountType: text("account_type").default("live"), // "live" | "demo" | "prop"
  timezone: text("timezone").default("UTC"),
  startingBalance: numeric("starting_balance", {
    precision: 14,
    scale: 2,
  }).notNull(),
  currentBalance: numeric("current_balance", {
    precision: 14,
    scale: 2,
  }).notNull(),
  defaultRiskPercent: numeric("default_risk_percent", {
    precision: 6,
    scale: 2,
  }),
  defaultLotSize: numeric("default_lot_size", {
    precision: 10,
    scale: 2,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
