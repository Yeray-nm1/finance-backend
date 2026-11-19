-- Unifica los avisos de metas: desaparece el modo manual y la aportación
-- programada pasa a ser un único aviso mensual sin importe en el correo.
-- Se cancelan las aportaciones pendientes antiguas (cuyo correo sí anunciaba
-- el importe) y sus notificaciones. Las aceptadas y el histórico de avisos
-- goal_reminder se conservan.

DELETE FROM "Notification"
WHERE "key" LIKE 'goal_contribution:%'
  AND EXISTS (
    SELECT 1
    FROM "GoalContribution" gc
    WHERE gc."status" = 'pending'
      AND "Notification"."key" = 'goal_contribution:' || gc."goalId" || ':' || gc."period"
  );

DELETE FROM "GoalContribution" WHERE "status" = 'pending';

-- Toda meta preexistente arranca sin avisos; el alta nueva usa el mismo default.
ALTER TABLE "SavingsGoal"
    ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    DROP COLUMN "contributionScheduled";

UPDATE "SavingsGoal" SET "reminderEnabled" = false;

-- El importe ya no se congela: es una sugerencia opcional que se puede editar
-- al confirmar la aportación.
ALTER TABLE "GoalContribution" ALTER COLUMN "amount" DROP NOT NULL;
