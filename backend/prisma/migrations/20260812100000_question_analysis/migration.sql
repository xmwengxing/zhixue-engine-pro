-- AlterTable: Question 独立解析字段 + 迁移既有 content.analysis 数据
ALTER TABLE "questions" ADD COLUMN "analysis" TEXT;
UPDATE "questions"
SET "analysis" = "content"->>'analysis'
WHERE "content"->>'analysis' IS NOT NULL AND "content"->>'analysis' != '';
