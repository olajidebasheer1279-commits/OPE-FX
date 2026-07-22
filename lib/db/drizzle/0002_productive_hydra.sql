DO $$ BEGIN
  ALTER TABLE "alerts" ADD COLUMN "repeat" boolean DEFAULT true NOT NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "alerts" ADD COLUMN "color" text DEFAULT '#3b82f6' NOT NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "alerts" ADD COLUMN "sound" text DEFAULT 'none' NOT NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;
