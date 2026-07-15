import {
  pgTable,
  serial,
  text,
  date,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Daily trading journal entry. One row per user per calendar day.
export const journalsTable = pgTable(
  "journals",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    date: date("date", { mode: "string" }).notNull(),
    // Self-rating scales, 1-10.
    mood: integer("mood"),
    confidence: integer("confidence"),
    discipline: integer("discipline"),
    fear: integer("fear"),
    greed: integer("greed"),
    focus: integer("focus"),
    sleep: integer("sleep"),
    tradingPlan: text("trading_plan"),
    notes: text("notes"),
    mistakes: text("mistakes"),
    lessons: text("lessons"),
    tomorrowGoal: text("tomorrow_goal"),
    isDraft: boolean("is_draft").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("journals_user_date_unique").on(table.userId, table.date)],
);

export const insertJournalSchema = createInsertSchema(journalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Journal = typeof journalsTable.$inferSelect;
