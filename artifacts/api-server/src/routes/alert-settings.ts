import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, alertSettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ─── Serialiser ───────────────────────────────────────────────────────────────

function serializeSettings(s: typeof alertSettingsTable.$inferSelect) {
  return {
    voiceEnabled: s.voiceEnabled,
    voiceGender: s.voiceGender,
    voiceVolume: parseFloat(s.voiceVolume),
    voiceSpeed: parseFloat(s.voiceSpeed),
    spokenName: s.spokenName,
    soundName: s.soundName,
    soundVolume: parseFloat(s.soundVolume),
    soundRepeat: s.soundRepeat,
    browserNotifications: s.browserNotifications,
    toastNotifications: s.toastNotifications,
    vibrationEnabled: s.vibrationEnabled,
    alertColor1: s.alertColor1,
    alertColor2: s.alertColor2,
    alertColor3: s.alertColor3,
    urgentMode: s.urgentMode,
  };
}

async function getOrCreate(userId: string) {
  const [existing] = await db
    .select()
    .from(alertSettingsTable)
    .where(eq(alertSettingsTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(alertSettingsTable)
    .values({ userId })
    .returning();
  return created;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /alert-settings — fetch or create default settings for the current user */
router.get("/alert-settings", requireAuth, async (req, res): Promise<void> => {
  try {
    const row = await getOrCreate(req.userId!);
    res.json(serializeSettings(row));
  } catch (err) {
    req.log.error({ err }, "Error fetching alert settings");
    res.status(500).json({ error: "Failed to fetch alert settings" });
  }
});

const UpdateBody = z.object({
  voiceEnabled: z.boolean().optional(),
  voiceGender: z.enum(["male", "female"]).optional(),
  voiceVolume: z.number().min(0).max(1).optional(),
  voiceSpeed: z.number().min(0.5).max(2).optional(),
  spokenName: z.string().min(1).max(100).optional(),
  soundName: z
    .enum([
      "emergency_alarm",
      "loud_bell",
      "siren",
      "air_horn",
      "loud_chime",
      "default_notification",
    ])
    .optional(),
  soundVolume: z.number().min(0).max(1).optional(),
  soundRepeat: z.enum(["once", "twice", "three_times", "continuous"]).optional(),
  browserNotifications: z.boolean().optional(),
  toastNotifications: z.boolean().optional(),
  vibrationEnabled: z.boolean().optional(),
  alertColor1: z.string().max(20).optional(),
  alertColor2: z.string().max(20).optional(),
  alertColor3: z.string().max(20).optional(),
  urgentMode: z.boolean().optional(),
});

/** PUT /alert-settings — upsert settings for the current user */
router.put("/alert-settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const fields: Record<string, unknown> = {};
  if (body.voiceEnabled !== undefined) fields.voiceEnabled = body.voiceEnabled;
  if (body.voiceGender !== undefined) fields.voiceGender = body.voiceGender;
  if (body.voiceVolume !== undefined) fields.voiceVolume = body.voiceVolume.toString();
  if (body.voiceSpeed !== undefined) fields.voiceSpeed = body.voiceSpeed.toString();
  if (body.spokenName !== undefined) fields.spokenName = body.spokenName;
  if (body.soundName !== undefined) fields.soundName = body.soundName;
  if (body.soundVolume !== undefined) fields.soundVolume = body.soundVolume.toString();
  if (body.soundRepeat !== undefined) fields.soundRepeat = body.soundRepeat;
  if (body.browserNotifications !== undefined) fields.browserNotifications = body.browserNotifications;
  if (body.toastNotifications !== undefined) fields.toastNotifications = body.toastNotifications;
  if (body.vibrationEnabled !== undefined) fields.vibrationEnabled = body.vibrationEnabled;
  if (body.alertColor1 !== undefined) fields.alertColor1 = body.alertColor1;
  if (body.alertColor2 !== undefined) fields.alertColor2 = body.alertColor2;
  if (body.alertColor3 !== undefined) fields.alertColor3 = body.alertColor3;
  if (body.urgentMode !== undefined) fields.urgentMode = body.urgentMode;

  try {
    const existing = await getOrCreate(req.userId!);
    const [updated] = await db
      .update(alertSettingsTable)
      .set(fields)
      .where(eq(alertSettingsTable.userId, req.userId!))
      .returning();
    void existing; // already created if missing above
    res.json(serializeSettings(updated));
  } catch (err) {
    req.log.error({ err }, "Error saving alert settings");
    res.status(500).json({ error: "Failed to save alert settings" });
  }
});

export default router;
