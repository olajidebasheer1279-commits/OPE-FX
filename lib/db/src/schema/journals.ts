import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tradesTable } from "./trades";

export const journalsTable = pgTable("journals", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  tradeId: integer("trade_id").references(() => tradesTable.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  mood: text("mood"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertJournalSchema = createInsertSchema(journalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Journal = typeof journalsTable.$inferSelect;
