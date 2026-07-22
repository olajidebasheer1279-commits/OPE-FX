import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { alertsTable } from "./alerts";

/**
 * alert_history — immutable log of every time an alert fired.
 * Rows are deleted (via explicit DB cascade) when their parent alert is deleted.
 */
export const alertHistoryTable = pgTable("alert_history", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id")
    .notNull()
    .references(() => alertsTable.id),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  triggeredAt: timestamp("triggered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // The live market / account value that tripped the condition
  triggerValue: numeric("trigger_value", { precision: 14, scale: 5 }),
  message: text("message"),
});

export type AlertHistory = typeof alertHistoryTable.$inferSelect;
export type InsertAlertHistory = typeof alertHistoryTable.$inferInsert;
