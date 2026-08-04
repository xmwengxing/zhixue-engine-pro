-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'SIGNUP_BONUS';
ALTER TYPE "TransactionType" ADD VALUE 'DAILY_GOAL_MET';
ALTER TYPE "TransactionType" ADD VALUE 'STREAK_BONUS';
ALTER TYPE "TransactionType" ADD VALUE 'WEEKLY_ATTENDANCE';
ALTER TYPE "TransactionType" ADD VALUE 'STAGE_COMPLETE';
ALTER TYPE "TransactionType" ADD VALUE 'FINAL_EXAM_DONE';
ALTER TYPE "TransactionType" ADD VALUE 'FINAL_EXAM_PASS';
ALTER TYPE "TransactionType" ADD VALUE 'SPECIAL_CORRECT';
ALTER TYPE "TransactionType" ADD VALUE 'PAPER_COMPLETE';
ALTER TYPE "TransactionType" ADD VALUE 'WORD_CORRECT';
ALTER TYPE "TransactionType" ADD VALUE 'WORD_ROUND_DONE';
ALTER TYPE "TransactionType" ADD VALUE 'WORD_REVIEW_CORRECT';
ALTER TYPE "TransactionType" ADD VALUE 'PARENT_ADJUST';
ALTER TYPE "TransactionType" ADD VALUE 'PARTICIPATION_PENALTY';
ALTER TYPE "TransactionType" ADD VALUE 'PENALTY_RETURN';

-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN "memo" TEXT;
CREATE INDEX "points_transactions_student_id_created_at_idx" ON "points_transactions"("student_id", "created_at");
