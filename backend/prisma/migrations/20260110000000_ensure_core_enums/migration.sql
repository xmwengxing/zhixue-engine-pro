-- 补齐缺失枚举（幂等）：AgentDocType/QuestionPaperCategory/PaperType/TaskCategory/SpecialTaskType/OcrMethod 早期无 CREATE TYPE migration，
-- 本 migration 时间戳最早先建全量值，历史 ALTER TYPE ADD VALUE 已注释避免重复。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agentdoctype') THEN
    CREATE TYPE "AgentDocType" AS ENUM ('FLOW', 'INSTRUCTION', 'CONSTRAINT', 'STANDARD', 'MEMORY_SPEC');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'questionpapercategory') THEN
    CREATE TYPE "QuestionPaperCategory" AS ENUM ('EXERCISE', 'ASSESSMENT');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'papertype') THEN
    CREATE TYPE "PaperType" AS ENUM ('UNIT', 'MIDTERM', 'FINAL', 'ZHONGKAO', 'GAOKAO');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'taskcategory') THEN
    CREATE TYPE "TaskCategory" AS ENUM ('SUBJECT_MAIN', 'SPECIAL');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'specialtasktype') THEN
    CREATE TYPE "SpecialTaskType" AS ENUM ('UNIT', 'KNOWLEDGE_POINT', 'ERROR_BOOK', 'PAPER', 'WORD');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ocrmethod') THEN
    CREATE TYPE "OcrMethod" AS ENUM ('LOCAL_SERVICE', 'LOCAL_VISION', 'CUSTOM_API', 'BAIDU_OCR', 'PADDLE_OCR_VL');
  END IF;
END $$;
