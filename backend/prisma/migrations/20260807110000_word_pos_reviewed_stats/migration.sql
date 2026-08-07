-- AlterTable
ALTER TABLE "words" ADD COLUMN "pos" TEXT NOT NULL DEFAULT '';
ALTER TABLE "word_mistakes" ADD COLUMN "reviewed_at" TIMESTAMP(3);
ALTER TABLE "word_sessions" ADD COLUMN "stats" JSONB;
