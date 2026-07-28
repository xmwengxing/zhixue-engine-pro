-- CreateEnum
CREATE TYPE "WishType" AS ENUM ('CASH', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrainingPhase" ADD VALUE 'DIAGNOSTIC_TEST';
ALTER TYPE "TrainingPhase" ADD VALUE 'PLANNING';
ALTER TYPE "TrainingPhase" ADD VALUE 'GUIDED_TRAINING';
ALTER TYPE "TrainingPhase" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "training_sessions" ADD COLUMN     "diagnostic_test_data" JSONB,
ADD COLUMN     "final_exam_data" JSONB,
ADD COLUMN     "training_plan_data" JSONB,
ADD COLUMN     "training_progress" JSONB,
ADD COLUMN     "training_report" TEXT;

-- AlterTable
ALTER TABLE "wishes" ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "type" "WishType" NOT NULL DEFAULT 'CUSTOM';
