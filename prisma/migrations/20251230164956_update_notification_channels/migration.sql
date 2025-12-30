-- AlterEnum
BEGIN;
CREATE TYPE "NotificationChannel_new" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'TELEGRAM', 'WEBHOOK');
ALTER TABLE "users" ALTER COLUMN "channels" TYPE "NotificationChannel_new"[] USING ("channels"::text::"NotificationChannel_new"[]);
ALTER TABLE "results" ALTER COLUMN "channel" TYPE "NotificationChannel_new"[] USING ("channel"::text::"NotificationChannel_new"[]);
ALTER TABLE "schedules" ALTER COLUMN "channel" TYPE "NotificationChannel_new"[] USING ("channel"::text::"NotificationChannel_new"[]);
ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
ALTER TYPE "NotificationChannel_new" RENAME TO "NotificationChannel";
DROP TYPE "public"."NotificationChannel_old";
COMMIT;
