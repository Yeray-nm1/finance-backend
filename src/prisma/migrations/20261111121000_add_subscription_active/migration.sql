-- La columna ya existía en algunas bases creadas con `prisma db push`.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
