-- Migration 0004: alert_settings table + alerts trigger_name columns
-- NOTE: push_subscriptions is already created in migration 0003.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this
-- migration is safe to apply against databases that were previously
-- synced via drizzle-kit push.

-- ── alert_settings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "alert_settings" (
  "id"                    serial           PRIMARY KEY NOT NULL,
  "user_id"               text             NOT NULL,
  "voice_enabled"         boolean          NOT NULL DEFAULT true,
  "voice_gender"          text             NOT NULL DEFAULT 'female',
  "voice_volume"          numeric(4, 2)    NOT NULL DEFAULT '0.8',
  "voice_speed"           numeric(4, 2)    NOT NULL DEFAULT '1.0',
  "spoken_name"           text             NOT NULL DEFAULT 'Basheer',
  "sound_name"            text             NOT NULL DEFAULT 'loud_bell',
  "sound_volume"          numeric(4, 2)    NOT NULL DEFAULT '0.8',
  "sound_repeat"          text             NOT NULL DEFAULT 'once',
  "browser_notifications" boolean          NOT NULL DEFAULT true,
  "toast_notifications"   boolean          NOT NULL DEFAULT true,
  "vibration_enabled"     boolean          NOT NULL DEFAULT true,
  "alert_color_1"         text             NOT NULL DEFAULT '#3b82f6',
  "alert_color_2"         text             NOT NULL DEFAULT '#eab308',
  "alert_color_3"         text             NOT NULL DEFAULT '#ef4444',
  "urgent_mode"           boolean          NOT NULL DEFAULT false,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "alert_settings_user_id_unique" UNIQUE ("user_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "alert_settings"
    ADD CONSTRAINT "alert_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- ── alerts: trigger_name columns (may already exist from drizzle-kit push) ───

ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "trigger_name"        text;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "trigger_name_custom"  text;
