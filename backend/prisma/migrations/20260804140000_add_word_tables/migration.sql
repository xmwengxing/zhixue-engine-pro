-- AlterEnum
-- [enum-ensure] 值 WORD 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "SpecialTaskType" ADD VALUE 'WORD';）

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "phonetic" TEXT NOT NULL DEFAULT '',
    "meaning" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "words_stage_word_key" ON "words"("stage", "word");

-- CreateTable
CREATE TABLE "word_mistakes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "last_wrong_at" TIMESTAMP(3),
    "next_review_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_mistakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "word_mistakes_student_id_word_id_key" ON "word_mistakes"("student_id", "word_id");

-- CreateIndex
CREATE INDEX "word_mistakes_student_id_next_review_at_idx" ON "word_mistakes"("student_id", "next_review_at");

-- CreateTable
CREATE TABLE "word_sessions" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "word_ids" JSONB NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "cloze_json" JSONB,
    "cloze_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_sessions_student_id_status_idx" ON "word_sessions"("student_id", "status");
