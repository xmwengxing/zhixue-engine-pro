-- CreateEnum
CREATE TYPE "WishType" AS ENUM ('CASH', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- [enum-ensure] 值 DIAGNOSTIC_TEST 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TrainingPhase" ADD VALUE 'DIAGNOSTIC_TEST';）
-- [enum-ensure] 值 PLANNING 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TrainingPhase" ADD VALUE 'PLANNING';）
-- [enum-ensure] 值 GUIDED_TRAINING 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TrainingPhase" ADD VALUE 'GUIDED_TRAINING';）
-- [enum-ensure] 值 COMPLETED 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TrainingPhase" ADD VALUE 'COMPLETED';）

-- AlterTable
ALTER TABLE "training_sessions" ADD COLUMN     "diagnostic_test_data" JSONB,
ADD COLUMN     "final_exam_data" JSONB,
ADD COLUMN     "training_plan_data" JSONB,
ADD COLUMN     "training_progress" JSONB,
ADD COLUMN     "training_report" TEXT;

-- AlterTable
ALTER TABLE "wishes" ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "type" "WishType" NOT NULL DEFAULT 'CUSTOM';
