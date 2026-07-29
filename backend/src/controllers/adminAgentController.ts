/**
 * 管理端「智能体配置」控制器（P5）
 * ------------------------------------------------------------------
 * - AgentDocument：FLOW/INSTRUCTION/CONSTRAINT/STANDARD/MEMORY_SPEC 文档 CRUD（版本号自增、启用开关）
 * - StudentMemory：学员记忆查看/编辑/删除 + 修订历史
 * - PlatformSetting：平台开关（如 AI 补题开关）读写
 */
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { studentMemoryService } from '../services/studentMemoryService';

const prisma = new PrismaClient();

const AGENT_DOC_TYPES = ['FLOW', 'INSTRUCTION', 'CONSTRAINT', 'STANDARD', 'MEMORY_SPEC'];

function adminId(req: Request): string {
  return (req as any).user?.userId ?? 'admin';
}

// ============ AgentDocument CRUD ============

/** GET /api/admin/agent-docs?type=&subject=&enabled= */
export async function listAgentDocs(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, subject, enabled } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (type && AGENT_DOC_TYPES.includes(type)) where.type = type;
    if (subject !== undefined) where.subject = subject === '' || subject === 'null' ? null : subject;
    if (enabled !== undefined) where.enabled = enabled === 'true';
    const docs = await prisma.agentDocument.findMany({
      where,
      orderBy: [{ type: 'asc' }, { priority: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json({ success: true, data: docs });
  } catch (e) {
    next(e);
  }
}

/** POST /api/admin/agent-docs */
export async function createAgentDoc(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, subject, title, content, priority, enabled } = req.body ?? {};
    if (!type || !AGENT_DOC_TYPES.includes(type)) {
      res.status(400).json({ error: { code: 'INVALID_TYPE', message: `type 必须为 ${AGENT_DOC_TYPES.join('/')}` } });
      return;
    }
    if (!title || !content) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'title 与 content 必填' } });
      return;
    }
    const doc = await prisma.agentDocument.create({
      data: {
        type,
        subject: subject || null,
        title: String(title),
        content: String(content),
        priority: Number.isFinite(Number(priority)) ? Number(priority) : 100,
        enabled: enabled !== false,
        updatedBy: adminId(req),
      },
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/admin/agent-docs/:id — 内容变更时版本号自增 */
export async function updateAgentDoc(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.agentDocument.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '文档不存在' } });
      return;
    }
    const { subject, title, content, priority, enabled } = req.body ?? {};
    const contentChanged = content !== undefined && String(content) !== existing.content;
    const doc = await prisma.agentDocument.update({
      where: { id },
      data: {
        ...(subject !== undefined ? { subject: subject || null } : {}),
        ...(title !== undefined ? { title: String(title) } : {}),
        ...(content !== undefined ? { content: String(content) } : {}),
        ...(priority !== undefined ? { priority: Number(priority) } : {}),
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
        ...(contentChanged ? { version: { increment: 1 } } : {}),
        updatedBy: adminId(req),
      },
    });
    res.json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
}

/** DELETE /api/admin/agent-docs/:id */
export async function deleteAgentDoc(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    await prisma.agentDocument.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

// ============ StudentMemory 管理 ============

/** GET /api/admin/student-memories?studentId= */
export async function listStudentMemories(req: Request, res: Response, next: NextFunction) {
  try {
    const rawStudentId = req.query.studentId;
    const studentId = rawStudentId ? String(rawStudentId) : undefined;
    const where: any = studentId ? { studentId } : {};
    const rows = await prisma.studentMemory.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
    // 附上学员姓名便于管理端展示
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const users = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, username: true, studentProfile: { select: { realName: true } } },
    });
    const nameMap = new Map(users.map((u) => [u.id, (u as any).studentProfile?.realName || u.username]));
    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, studentName: nameMap.get(r.studentId) ?? r.studentId })),
    });
  } catch (e) {
    next(e);
  }
}

/** GET /api/admin/student-memories/:id — 含修订历史 */
export async function getStudentMemory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const row = await prisma.studentMemory.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '记忆不存在' } });
      return;
    }
    const logs = await studentMemoryService.getMemoryLogs(id, 20);
    res.json({ success: true, data: { ...row, logs } });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/admin/student-memories/:id — 人工修订内容 */
export async function updateStudentMemory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const { content } = req.body ?? {};
    if (!content) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'content 必填' } });
      return;
    }
    const row = await prisma.studentMemory.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '记忆不存在' } });
      return;
    }
    const updated = await studentMemoryService.upsertMemory(
      row.studentId,
      row.subject,
      String(content),
      `管理员 ${adminId(req)} 人工修订`
    );
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
}

/** DELETE /api/admin/student-memories/:id */
export async function deleteStudentMemory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    await studentMemoryService.deleteMemory(id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

// ============ PlatformSetting ============

/** GET /api/admin/platform-settings */
export async function listPlatformSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.platformSetting.findMany({ orderBy: { key: 'asc' } });
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
}

/** PUT /api/admin/platform-settings/:key */
export async function updatePlatformSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const key = String(req.params.key);
    const { value } = req.body ?? {};
    if (value === undefined) {
      res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'value 必填' } });
      return;
    }
    const row = await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: adminId(req) },
      update: { value, updatedBy: adminId(req) },
    });
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
}
