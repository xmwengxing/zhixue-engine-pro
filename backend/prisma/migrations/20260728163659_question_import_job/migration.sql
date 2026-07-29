-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "question_import_jobs" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "raw_text" TEXT,
    "result" JSONB,
    "error" TEXT,
    "paper_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_import_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "question_import_jobs" ADD CONSTRAINT "question_import_jobs_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "question_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
