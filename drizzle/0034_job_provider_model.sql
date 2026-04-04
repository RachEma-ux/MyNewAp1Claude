-- Add provider/model tracking to code_jobs
ALTER TABLE "code_jobs" ADD COLUMN IF NOT EXISTS "provider_name" varchar(60);
ALTER TABLE "code_jobs" ADD COLUMN IF NOT EXISTS "model_id" varchar(120);
