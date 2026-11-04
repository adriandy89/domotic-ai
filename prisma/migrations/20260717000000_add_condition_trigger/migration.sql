-- AND-mode ("all") rules only: when false, incoming data for this condition
-- never initiates rule evaluation — it only participates as an evaluator.
ALTER TABLE "conditions" ADD COLUMN "trigger" BOOLEAN NOT NULL DEFAULT true;
