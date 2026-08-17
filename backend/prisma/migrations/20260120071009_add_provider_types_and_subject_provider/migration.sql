-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- [enum-ensure] 值 DEEPSEEK 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "AIProviderType" ADD VALUE 'DEEPSEEK';）
-- [enum-ensure] 值 QWEN 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "AIProviderType" ADD VALUE 'QWEN';）
-- [enum-ensure] 值 GEMINI 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "AIProviderType" ADD VALUE 'GEMINI';）
-- [enum-ensure] 值 ZHIPU 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "AIProviderType" ADD VALUE 'ZHIPU';）
-- [enum-ensure] 值 DOUBAO 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "AIProviderType" ADD VALUE 'DOUBAO';）
-- [enum-ensure] 值 WENXIN 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "AIProviderType" ADD VALUE 'WENXIN';）

-- AlterTable
ALTER TABLE "subject_instructions" ADD COLUMN     "provider_id" TEXT;
