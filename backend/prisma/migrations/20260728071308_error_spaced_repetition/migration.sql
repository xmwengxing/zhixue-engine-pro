-- AlterTable
ALTER TABLE "error_questions" ADD COLUMN     "consecutive_correct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "next_review_at" TIMESTAMP(3),
ADD COLUMN     "review_history" JSONB,
ADD COLUMN     "review_stage" INTEGER NOT NULL DEFAULT 0;
