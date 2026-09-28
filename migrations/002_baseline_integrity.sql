UPDATE runs
SET baseline_id = NULL
WHERE baseline_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM baselines WHERE baselines.id = runs.baseline_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'runs_baseline_id_fkey'
  ) THEN
    ALTER TABLE runs
      ADD CONSTRAINT runs_baseline_id_fkey
      FOREIGN KEY (baseline_id)
      REFERENCES baselines(id)
      ON DELETE SET NULL;
  END IF;
END
$$;