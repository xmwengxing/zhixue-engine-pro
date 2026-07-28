/*
  Warnings:

  - Added the required column `gender` to the `student_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT NOT NULL,
ADD COLUMN     "interests" TEXT,
ADD COLUMN     "learning_foundation" TEXT,
ADD COLUMN     "school" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "real_name" TEXT;

-- CreateIndex
CREATE INDEX "parent_child_relations_parent_id_idx" ON "parent_child_relations"("parent_id");

-- CreateIndex
CREATE INDEX "parent_child_relations_student_id_idx" ON "parent_child_relations"("student_id");

-- CreateIndex
CREATE INDEX "student_ids_status_idx" ON "student_ids"("status");

-- CreateIndex
CREATE INDEX "student_ids_created_at_idx" ON "student_ids"("created_at");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
