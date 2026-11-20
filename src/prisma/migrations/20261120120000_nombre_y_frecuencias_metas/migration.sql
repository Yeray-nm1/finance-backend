-- Nombre opcional en correos y frecuencias de avisos por meta.
-- Las metas preexistentes pasan a mensuales, app+email, con su día anterior;
-- los periodos antiguos YYYY-MM pasan a M:YYYY-MM para no mezclar formatos.

CREATE TYPE "GoalReminderFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "GoalReminderChannel" AS ENUM ('APP_ONLY', 'APP_AND_EMAIL');
CREATE TYPE "GoalReminderIntervalUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS');

ALTER TABLE "User" ADD COLUMN "name" TEXT;

ALTER TABLE "SavingsGoal"
    ADD COLUMN "reminderFrequency" "GoalReminderFrequency" NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN "reminderChannel" "GoalReminderChannel" NOT NULL DEFAULT 'APP_AND_EMAIL',
    ADD COLUMN "reminderWeekday" INTEGER,
    ADD COLUMN "reminderLastDay" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "reminderInterval" INTEGER,
    ADD COLUMN "reminderIntervalUnit" "GoalReminderIntervalUnit",
    ADD COLUMN "reminderStartDate" TIMESTAMP(3);

-- Backfill explícito: el valor por defecto ya es mensual/app+email, pero lo
-- dejamos escrito para que el resultado no dependa del orden de los ALTER.
UPDATE "SavingsGoal"
SET "reminderFrequency" = 'MONTHLY',
    "reminderChannel" = 'APP_AND_EMAIL',
    "reminderDay" = COALESCE("reminderDay", 1),
    "reminderLastDay" = false;

-- Los enlaces ya enviados con periodo sin prefijo dejan de ser vigentes; el
-- siguiente aviso entrega uno nuevo con el formato M:YYYY-MM.
UPDATE "GoalContribution"
SET "period" = 'M:' || "period"
WHERE "period" ~ '^[0-9]{4}-[0-9]{2}$';

UPDATE "Notification"
SET "key" = 'goal_contribution:'
           || substring("key" from '^goal_contribution:([^:]+):')
           || 'M:' || substring("key" from ':([0-9]{4}-[0-9]{2})$')
WHERE "key" ~ '^goal_contribution:[^:]+:[0-9]{4}-[0-9]{2}$';

-- Bases de desarrollo/E2E: cuentas claramente de prueba no reciben la plantilla nueva.
UPDATE "SavingsGoal" sg
SET "reminderEnabled" = false
FROM "User" u
WHERE sg."userId" = u."id"
  AND (u."email" ILIKE '%example.com'
       OR u."email" ILIKE '%@test.%'
       OR u."email" ILIKE '%e2e%');
