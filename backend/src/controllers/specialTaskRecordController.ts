import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 查询专项攻克任务训练记录明细（学员端 / 家长端共用逻辑） */
async function listRecords(
  studentId: string,
  q: { taskId?: string; specialType?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.max(1, Math.min(q.limit ?? 20, 50));
  const where: any = { studentId };
  if (q.taskId) where.taskId = q.taskId;
  if (q.specialType) where.specialType = q.specialType;
  const [items, total] = await Promise.all([
    prisma.specialTaskRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.specialTaskRecord.count({ where }),
  ]);
  return { items, total, page, limit };
}

/** GET /student/special-records?taskId=&specialType=&page=&limit= */
export const studentListRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未认证' } });
      return;
    }
    const result = await listRecords(studentId, {
      taskId: req.query.taskId ? String(req.query.taskId) : undefined,
      specialType: req.query.specialType ? String(req.query.specialType) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/** GET /parent/children/:studentId/special-records?taskId= */
export const parentListRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = req.user?.userId;
    if (!parentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未认证' } });
      return;
    }
    const studentId = String(req.params.studentId);
    // 校验亲子关系
    const rel = await prisma.parentChildRelation.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (!rel) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该学员' } });
      return;
    }
    const result = await listRecords(studentId, {
      taskId: req.query.taskId ? String(req.query.taskId) : undefined,
      specialType: req.query.specialType ? String(req.query.specialType) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const specialTaskRecordController = { studentListRecords, parentListRecords };
