-- AlterEnum
ALTER TYPE "OcrMethod" ADD VALUE 'BAIDU_OCR';
ALTER TYPE "OcrMethod" ADD VALUE 'PADDLE_OCR_VL';

-- AlterTable
ALTER TABLE "ocr_providers" ADD COLUMN "extra" JSONB;
