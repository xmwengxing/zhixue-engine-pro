-- AlterEnum
-- [enum-ensure] 值 BAIDU_OCR 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "OcrMethod" ADD VALUE 'BAIDU_OCR';）
-- [enum-ensure] 值 PADDLE_OCR_VL 已由 20260110000000_ensure_core_enums 提供（原: ALTER TYPE "OcrMethod" ADD VALUE 'PADDLE_OCR_VL';）

-- AlterTable
ALTER TABLE "ocr_providers" ADD COLUMN "extra" JSONB;
