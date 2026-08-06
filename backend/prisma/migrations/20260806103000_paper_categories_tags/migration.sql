-- CreateTable
CREATE TABLE "paper_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "parent_id" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "color" TEXT DEFAULT '#3b82f6',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_tags_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "question_papers" ADD COLUMN "category_id" TEXT,
ADD COLUMN "tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "paper_categories_subject_parent_id_idx" ON "paper_categories"("subject", "parent_id");

-- CreateIndex
CREATE INDEX "paper_tags_subject_idx" ON "paper_tags"("subject");

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "paper_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_categories" ADD CONSTRAINT "paper_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "paper_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
