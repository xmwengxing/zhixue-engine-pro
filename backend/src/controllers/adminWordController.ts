// 词库管理（Word 表）：列表/搜索/新增/编辑/删除/导入（新增词库或追加）
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const adminWordController = {
  /** GET /admin/word-bank/stages — 词库列表（含词数） */
  async stages(_req: Request, res: Response) {
    try {
      const rows = await prisma.word.groupBy({ by: ['stage'], _count: true });
      const stages = rows
        .map((r) => ({ stage: r.stage, count: r._count }))
        .sort((a, b) => a.stage.localeCompare(b.stage, 'zh'));
      return res.json({ success: true, data: { stages } });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  },

  /** GET /admin/word-bank/words?stage=&keyword=&page=&limit= */
  async listWords(req: Request, res: Response) {
    try {
      const stage = String(req.query.stage || '');
      const keyword = String(req.query.keyword || '');
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
      const where: any = {};
      if (stage) where.stage = stage;
      if (keyword) {
        where.OR = [
          { word: { contains: keyword, mode: 'insensitive' } },
          { meaning: { contains: keyword } },
        ];
      }
      const [total, items] = await Promise.all([
        prisma.word.count({ where }),
        prisma.word.findMany({
          where,
          orderBy: { word: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return res.json({ success: true, data: { items, total, page, limit } });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  },

  /** POST /admin/word-bank/words — 新增单词（同 stage 同词幂等更新） */
  async createWord(req: Request, res: Response) {
    try {
      const { stage, word, phonetic, pos, meaning } = req.body ?? {};
      if (!stage || !word || !meaning) {
        return res.status(400).json({ success: false, message: 'stage / word / meaning 必填' });
      }
      const w = String(word).trim().toLowerCase();
      const existing = await prisma.word.findUnique({
        where: { stage_word: { stage: String(stage), word: w } },
      });
      if (existing) {
        const updated = await prisma.word.update({
          where: { id: existing.id },
          data: { phonetic: phonetic || '', pos: pos || '', meaning: String(meaning) },
        });
        return res.json({ success: true, data: updated, updated: true });
      }
      const created = await prisma.word.create({
        data: {
          stage: String(stage),
          word: w,
          phonetic: phonetic || '',
          pos: pos || '',
          meaning: String(meaning),
        },
      });
      return res.status(201).json({ success: true, data: created, updated: false });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e.message });
    }
  },

  /** PUT /admin/word-bank/words/:id — 修改释义/音标/词性 */
  async updateWord(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { phonetic, pos, meaning } = req.body ?? {};
      if (!meaning) {
        return res.status(400).json({ success: false, message: 'meaning 必填' });
      }
      const updated = await prisma.word.update({
        where: { id },
        data: { phonetic: phonetic ?? undefined, pos: pos ?? undefined, meaning: String(meaning) },
      });
      return res.json({ success: true, data: updated });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e.message });
    }
  },

  /** DELETE /admin/word-bank/words/:id — 删除单词 */
  async deleteWord(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await prisma.word.delete({ where: { id } });
      return res.json({ success: true, message: '已删除' });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e.message });
    }
  },

  /** POST /admin/word-bank/import — 导入词库（JSON 数组 / {words}），可新增词库或追加 */
  async importWords(req: Request, res: Response) {
    try {
      const { stage, words } = req.body ?? {};
      if (!stage || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ success: false, message: 'stage 与 words 数组必填' });
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const w of words) {
        if (!w?.word || !w?.meaning) { skipped++; continue; }
        const word = String(w.word).trim().toLowerCase();
        const existing = await prisma.word.findUnique({
          where: { stage_word: { stage: String(stage), word } },
          select: { id: true, phonetic: true, pos: true },
        });
        if (existing) {
          await prisma.word.update({
            where: { id: existing.id },
            data: {
              phonetic: w.phonetic || existing.phonetic || '',
              pos: w.pos || existing.pos || '',
              meaning: String(w.meaning),
            },
          });
          updated++;
        } else {
          await prisma.word.create({
            data: {
              stage: String(stage),
              word,
              phonetic: w.phonetic || '',
              pos: w.pos || '',
              meaning: String(w.meaning),
            },
          });
          created++;
        }
      }
      return res.json({ success: true, data: { stage: String(stage), total: words.length, created, updated, skipped } });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e.message });
    }
  },
};
