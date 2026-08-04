-- CreateTable
CREATE TABLE "daily_training_records" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_training_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_training_records_task_id_student_id_date_key" ON "daily_training_records"("task_id", "student_id", "date");

-- CreateIndex
CREATE INDEX "daily_training_records_student_id_date_idx" ON "daily_training_records"("student_id", "date");
