ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "category" varchar(100);
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "subCategory" varchar(100);
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "capabilities" json;
