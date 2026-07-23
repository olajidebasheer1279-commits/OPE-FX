import {
  pgTable,
  serial,
  text,
  boolean,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * alert_settings — per-user preferences for how alerts are delivered.
 * One row per user, upserted on save. Created with defaults on first fetch.
 */
export const alertSettingsTable = pgTable("alert_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),

  // ── Voice Assistant ────────────────────────────────────────────────────────
  voiceEnabled: boolean("voice_enabled").notNull().default(true),
  /** 'male' | 'female' */
  voiceGender: text("voice_gender").notNull().default("female"),
  voiceVolume: numeric("voice_volume", { precision: 4, scale: 2 })
    .notNull()
    .default("0.8"),
  voiceSpeed: numeric("voice_speed", { precision: 4, scale: 2 })
    .notNull()
    .default("1.0"),
  spokenName: text("spoken_name").notNull().default("Basheer"),

  // ── Alert Sound ───────────────────────────────────────────────────────────
  /** 'emergency_alarm' | 'loud_bell' | 'siren' | 'air_horn' | 'loud_chime' | 'default_notification' */
  soundName: text("sound_name").notNull().default("loud_bell"),
  soundVolume: numeric("sound_volume", { precision: 4, scale: 2 })
    .notNull()
    .default("0.8"),
  /** 'once' | 'twice' | 'three_times' | 'continuous' */
  soundRepeat: text("sound_repeat").notNull().default("once"),

  // ── Notifications ─────────────────────────────────────────────────────────
  browserNotifications: boolean("browser_notifications").notNull().default(true),
  toastNotifications: boolean("toast_notifications").notNull().default(true),
  vibrationEnabled: boolean("vibration_enabled").notNull().default(true),

  // ── Alert Colours ─────────────────────────────────────────────────────────
  alertColor1: text("alert_color_1").notNull().default("#3b82f6"), // Blue  Alert 1
  alertColor2: text("alert_color_2").notNull().default("#eab308"), // Yellow Alert 2
  alertColor3: text("alert_color_3").notNull().default("#ef4444"), // Red   Alert 3

  // ── Urgent Mode ───────────────────────────────────────────────────────────
  urgentMode: boolean("urgent_mode").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AlertSettings = typeof alertSettingsTable.$inferSelect;
export type InsertAlertSettings = typeof alertSettingsTable.$inferInsert;
