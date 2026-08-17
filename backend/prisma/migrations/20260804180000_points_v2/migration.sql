-- AlterEnum
-- [enum-ensure] 值 SIGNUP_BONUS 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'SIGNUP_BONUS';）
-- [enum-ensure] 值 DAILY_GOAL_MET 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'DAILY_GOAL_MET';）
-- [enum-ensure] 值 STREAK_BONUS 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'STREAK_BONUS';）
-- [enum-ensure] 值 WEEKLY_ATTENDANCE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'WEEKLY_ATTENDANCE';）
-- [enum-ensure] 值 STAGE_COMPLETE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'STAGE_COMPLETE';）
-- [enum-ensure] 值 FINAL_EXAM_DONE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'FINAL_EXAM_DONE';）
-- [enum-ensure] 值 FINAL_EXAM_PASS 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'FINAL_EXAM_PASS';）
-- [enum-ensure] 值 SPECIAL_CORRECT 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'SPECIAL_CORRECT';）
-- [enum-ensure] 值 PAPER_COMPLETE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'PAPER_COMPLETE';）
-- [enum-ensure] 值 WORD_CORRECT 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'WORD_CORRECT';）
-- [enum-ensure] 值 WORD_ROUND_DONE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'WORD_ROUND_DONE';）
-- [enum-ensure] 值 WORD_REVIEW_CORRECT 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'WORD_REVIEW_CORRECT';）
-- [enum-ensure] 值 PARENT_ADJUST 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'PARENT_ADJUST';）
-- [enum-ensure] 值 PARTICIPATION_PENALTY 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'PARTICIPATION_PENALTY';）
-- [enum-ensure] 值 PENALTY_RETURN 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TransactionType" ADD VALUE 'PENALTY_RETURN';）

-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN "memo" TEXT;
CREATE INDEX "points_transactions_student_id_created_at_idx" ON "points_transactions"("student_id", "created_at");
