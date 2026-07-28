-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AIProviderType" ADD VALUE 'DEEPSEEK';
ALTER TYPE "AIProviderType" ADD VALUE 'QWEN';
ALTER TYPE "AIProviderType" ADD VALUE 'GEMINI';
ALTER TYPE "AIProviderType" ADD VALUE 'ZHIPU';
ALTER TYPE "AIProviderType" ADD VALUE 'DOUBAO';
ALTER TYPE "AIProviderType" ADD VALUE 'WENXIN';

-- AlterTable
ALTER TABLE "subject_instructions" ADD COLUMN     "provider_id" TEXT;
