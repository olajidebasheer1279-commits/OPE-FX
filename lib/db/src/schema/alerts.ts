import {
  pgTable,
  serial,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tradesTable } from "./trades";

/**
 * alerts — price / PnL / drawdown / R:R conditions the user wants to watch.
 * A trade-linked alert (tradeId set) is deleted automatically when the trade
 * is deleted (handled in the trades DELETE route via explicit cascade).
 */
export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  // Nullable: standalone alerts don't require a trade reference.
  tradeId: integer("trade_id").references(() => tradesTable.id),
  name: text("name").notNull(),
  // 'price' | 'pnl' | 'drawdown' | 'rr' | 'custom'
  type: text("type").notNull().default("price"),
  // 'above' | 'below' | 'equals'
  condition: text("condition").notNull().default("above"),
  targetValue: numeric("target_value", { precision: 14, scale: 5 }).notNull(),
  // e.g. 'EURUSD' — ignored for account-level types like 'drawdown'
  symbol: text("symbol").notNull(),
  // Custom message shown when triggered
  message: text("message"),
  // Whether the alert re-arms after firing (true) or fires once then disables (false)
  repeat: boolean("repeat").notNull().default(true),
  // Hex colour swatch displayed in the UI (e.g. "#3b82f6")
  color: text("color").notNull().default("#3b82f6"),
  // Audio cue: 'none' | 'chime' | 'beep' | 'bell' | 'emergency_alarm' | 'loud_bell' | 'siren' | 'air_horn' | 'loud_chime' | 'default_notification'
  sound: text("sound").notNull().default("none"),
  // Trigger name label: 'poi' | 'bos' | 'choch' | 'liquidity_sweep' | 'entry' | 'take_profit' | 'stop_loss' | 'custom'
  triggerName: text("trigger_name"),
  // Free-text name used when triggerName = 'custom'
  triggerNameCustom: text("trigger_name_custom"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Alert = typeof alertsTable.$inferSelect;
export type InsertAlert = typeof alertsTable.$inferInsert;
