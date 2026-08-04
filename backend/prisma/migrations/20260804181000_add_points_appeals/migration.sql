-- CreateTable
CREATE TABLE "points_appeals" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "tx_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    CONSTRAINT "points_appeals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "points_appeals_student_id_status_idx" ON "points_appeals"("student_id", "status");
