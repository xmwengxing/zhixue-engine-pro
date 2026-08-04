import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { pointsEngineService } from '../services/pointsEngineService';

const prisma = new PrismaClient();

/** GET /student/points/balance — 余额 + 总入总出 + 扣分警告 */
export const getBalance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    await pointsEngineService.ensureSignupBonus(studentId); // 开户基础分（惰性）
    const balance = await pointsEngineService.getBalance(studentId);
    const [earned, spent] = await Promise.all([
      prisma.pointsTransaction.aggregate({ where: { studentId, amount: { gt: 0 } }, _sum: { amount: true } }),
      prisma.pointsTransaction.aggregate({ where: { studentId, amount: { lt: 0 } }, _sum: { amount: true } }),
    ]);
    const warnings = await pointsEngineService.getPenaltyWarnings(studentId);
    res.json({
      success: true,
      data: {
        balance,
        totalEarned: earned._sum.amount || 0,
        totalSpent: Math.abs(spent._sum.amount || 0),
        warnings,
      },
    });
  } catch (e) {
    next(e);
  }
};

/** GET /student/points/transactions?type=&page= — 流水明细 */
export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    await pointsEngineService.ensureSignupBonus(studentId);
    const type = String(req.query.type ?? 'ALL');
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const data = await pointsEngineService.listTransactions(studentId, type, page);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** GET /student/points/rules — 积分规则页数据 */
export const getRules = async (_req: Request, res: Response) => {
  res.json({ success: true, data: pointsEngineService.POINTS_RULES });
};

/** POST /student/points/appeal/:txId — 扣分申诉 */
export const submitAppeal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const txId = String(req.params.txId);
    const { reason } = req.body ?? {};
    if (!reason || String(reason).trim().length < 2) {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '请填写申诉原因' } });
      return;
    }
    const tx = await prisma.pointsTransaction.findFirst({ where: { id: txId, studentId, amount: { lt: 0 } } });
    if (!tx) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '扣分记录不存在' } });
      return;
    }
    const existing = await prisma.pointsAppeal.findFirst({ where: { studentId, txId, status: 'PENDING' } });
    if (existing) {
      res.status(409).json({ error: { code: 'CONFLICT', message: '该扣分已提交申诉，请等待家长审核' } });
      return;
    }
    const appeal = await prisma.pointsAppeal.create({
      data: { studentId, txId, reason: String(reason).trim() },
    });
    res.status(201).json({ success: true, data: appeal });
  } catch (e) {
    next(e);
  }
};

/** GET /student/points/appeals — 我的申诉列表 */
export const listMyAppeals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const rows = await prisma.pointsAppeal.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

// ==================== 家长端 ====================

/** GET /parent/children/:studentId/points — 孩子积分总览（余额 + 近 30 天流水 + 待审申诉） */
export const parentOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = req.user?.userId;
    const studentId = String(req.params.studentId);
    if (!parentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该学员' } });
      return;
    }
    await pointsEngineService.ensureSignupBonus(studentId);
    const balance = await pointsEngineService.getBalance(studentId);
    const [rows, appeals] = await Promise.all([
      prisma.pointsTransaction.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      prisma.pointsAppeal.findMany({
        where: { studentId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    res.json({ success: true, data: { balance, transactions: rows, pendingAppeals: appeals } });
  } catch (e) {
    next(e);
  }
};

/** POST /parent/children/:studentId/points/adjust — 家长手动调整（±，附原因） */
export const parentAdjust = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = req.user?.userId;
    const studentId = String(req.params.studentId);
    if (!parentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该学员' } });
      return;
    }
    const { amount, memo } = req.body ?? {};
    const num = Math.trunc(Number(amount));
    if (!Number.isFinite(num) || num === 0 || Math.abs(num) > 500) {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '调整分值需在 ±500 之间且非 0' } });
      return;
    }
    if (!memo || String(memo).trim().length < 2) {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '请填写调整原因（家长与学员都能看到）' } });
      return;
    }
    await prisma.$transaction(async (tx) => {
      const last = await tx.pointsTransaction.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        select: { balance: true },
      });
      const balance = last?.balance ?? 0;
      // 家长手动调分不扣成负
      const actual = num > 0 ? num : Math.max(num, -balance);
      if (actual === 0) return;
      await tx.pointsTransaction.create({
        data: {
          studentId,
          amount: actual,
          type: 'PARENT_ADJUST',
          balance: balance + actual,
          memo: `家长调整：${String(memo).trim()}`,
        },
      });
    });
    res.json({ success: true, data: { balance: await pointsEngineService.getBalance(studentId) } });
  } catch (e) {
    next(e);
  }
};

/** POST /parent/points/appeals/:appealId/review — 申诉审核（通过则返还全额） */
export const reviewAppeal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = req.user?.userId;
    if (!parentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const appealId = String(req.params.appealId);
    const { approve, note } = req.body ?? {};
    const appeal = await prisma.pointsAppeal.findUnique({ where: { id: appealId } });
    if (!appeal || appeal.status !== 'PENDING') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '申诉不存在或已处理' } });
      return;
    }
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId: appeal.studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权处理该申诉' } });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.pointsAppeal.update({
        where: { id: appeal.id },
        data: { status: approve === true ? 'APPROVED' : 'REJECTED', reviewNote: note || null, reviewedAt: new Date() },
      });
      if (approve === true) {
        // 返还扣分全额
        const tx0 = await tx.pointsTransaction.findUnique({ where: { id: appeal.txId } });
        if (tx0 && tx0.amount < 0) {
          const last = await tx.pointsTransaction.findFirst({
            where: { studentId: appeal.studentId },
            orderBy: { createdAt: 'desc' },
            select: { balance: true },
          });
          await tx.pointsTransaction.create({
            data: {
              studentId: appeal.studentId,
              amount: Math.abs(tx0.amount),
              type: 'PENALTY_RETURN',
              relatedId: tx0.id,
              balance: (last?.balance ?? 0) + Math.abs(tx0.amount),
              memo: `申诉通过，返还扣分（${tx0.memo || ''}）`,
            },
          });
        }
      }
    });
    res.json({ success: true, data: { status: 'OK' } });
  } catch (e) {
    next(e);
  }
};

export const pointsController = {
  getBalance,
  getTransactions,
  getRules,
  submitAppeal,
  listMyAppeals,
  parentOverview,
  parentAdjust,
  reviewAppeal,
};
