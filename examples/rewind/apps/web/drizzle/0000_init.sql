-- Baseline for the migration journal. libSQL rejects an empty migration,
-- so it runs a no-op. Tables start in the next migration (rewinds-api).
SELECT 1;
