-- CreateTable
CREATE TABLE "special_task_records" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "special_type" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT '',
    "total" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "cloze_total" INTEGER NOT NULL DEFAULT 0,
    "cloze_correct" INTEGER NOT NULL DEFAULT 0,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "special_task_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "special_task_records_task_id_created_at_idx" ON "special_task_records"("task_id", "created_at");
CREATE INDEX "special_task_records_student_id_special_type_idx" ON "special_task_records"("student_id", "special_type");
