-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('DRAFT', 'NORMALIZED', 'PUBLISHED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- [enum-ensure] 值 JUDGE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'JUDGE';）
-- [enum-ensure] 值 MULTIPLE_CHOICE 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'MULTIPLE_CHOICE';）
-- [enum-ensure] 值 FORMULA 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'FORMULA';）
-- [enum-ensure] 值 GEOMETRY 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'GEOMETRY';）
-- [enum-ensure] 值 GRAPHING 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'GRAPHING';）
-- [enum-ensure] 值 PROOF 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'PROOF';）
-- [enum-ensure] 值 SORTING 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'SORTING';）
-- [enum-ensure] 值 MATCHING 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "QuestionType" ADD VALUE 'MATCHING';）

-- AlterEnum
-- [enum-ensure] 值 EXAM_PAPER 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "TaskMode" ADD VALUE 'EXAM_PAPER';）

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "answer_data" JSONB,
ADD COLUMN     "input_method" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "answer_config" JSONB,
ADD COLUMN     "answer_type" TEXT;

-- CreateTable
CREATE TABLE "question_papers" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "grade" TEXT,
    "source_file" TEXT,
    "status" "PaperStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_paper_items" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_paper_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_paper_items_paper_id_question_id_key" ON "question_paper_items"("paper_id", "question_id");

-- AddForeignKey
ALTER TABLE "question_paper_items" ADD CONSTRAINT "question_paper_items_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "question_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_items" ADD CONSTRAINT "question_paper_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
