-- Add the optional "when to execute" window to rules. All defaults keep
-- existing rules behaving exactly as before (window_active = false).
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "window_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "window_days" "ScheduleDays"[] DEFAULT ARRAY[]::"ScheduleDays"[];
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "window_all_day" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "window_start" INTEGER;
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "window_end" INTEGER;
