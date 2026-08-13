-- Add cloze_active to word_sessions
ALTER TABLE "word_sessions" ADD COLUMN "cloze_active" BOOLEAN NOT NULL DEFAULT false;
