/**
 * 分层上下文装配器（P5 训练舱智能体平台核心）
 * ------------------------------------------------------------------
 * 每次 AI 调用（引导对话/规划/批改/报告等场景）统一装配 system prompt，
 * 按 L1→L6 优先级注入，并做 token 预算裁剪：
 *
 *   L1 约束 CONSTRAINT（全局+学科）        ← 永不裁剪
 *   L2 角色指令 INSTRUCTION（学科=科目指令配置唯一源；全局=智能体平台）
 *   L3 流程文档 FLOW（仅当前阶段的段落）
 *   L4 学员记忆 StudentMemory（全局+该学科）
 *   L5 学科学情摘要 SubjectLearningState（程序生成摘要，非全量）
 *   L6 任务配置与会话状态（由调用方传入）
 *
 * 文档来源：AgentDocument 表（管理端可增删改查）。
 * 学科专属角色指令（L2 学科部分）来自 SubjectInstruction 表（「科目指令配置」，唯一权威源），
 * 避免与智能体平台重复配置冲突；其余分层文档来自 AgentDocument 表。智能体平台中 subject 非空的
 * INSTRUCTION 文档已被「科目指令配置」取代，不再注入 L2。
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { subjectLearningStateService } from './subjectLearningStateService';

const prisma = new PrismaClient();

/** 粗略字符预算（中文 1 字 ≈ 1 token 量级，保守取 12000 字） */
const CHAR_BUDGET = 12000;
/** 各可裁剪层的单层上限（超出截断） */
const LAYER_CAP: Record<string, number> = {
  L2: 3000,
  L3: 3000,
  L4: 2500,
  L5: 1500,
  L6: 2500,
};

export interface AgentContextInput {
  studentId: string;
  /** 学科（如 数学/英语）；缺省时跳过学科专属文档与 L4/L5 学科部分 */
  subject?: string | null;
  /**
   * 当前训练阶段（用于 L3 流程段落筛选），如
   * DIAGNOSTIC_TEST / PLANNING / GUIDED_TRAINING / FINAL_EXAM
   */
  phase?: string;
  /** 调用场景说明（写进 L6 头部，帮助 AI 明确本次调用目的） */
  scene?: string;
  /** L6：任务配置与会话状态摘要（由调用方拼好的纯文本） */
  sessionState?: string;
}

export interface AgentContextResult {
  systemPrompt: string;
  /** 各层实际注入长度，便于调试与审计 */
  meta: { layer: string; title: string; chars: number }[];
}

interface DocRow {
  id: string;
  type: string;
  subject: string | null;
  title: string;
  content: string;
  priority: number;
}

/** 取某类型文档：全局 + 学科专属，按 priority 升序；INSTRUCTION 学科覆盖全局 */
async function loadDocs(
  type: string,
  subject?: string | null,
  subjectOverridesGlobal = false
): Promise<DocRow[]> {
  const docs = await prisma.agentDocument.findMany({
    where: {
      type: type as any,
      enabled: true,
      OR: subject ? [{ subject: null }, { subject }] : [{ subject: null }],
    },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
  });
  if (subjectOverridesGlobal && subject) {
    const subjectDocs = docs.filter((d) => d.subject === subject);
    if (subjectDocs.length > 0) return subjectDocs as DocRow[];
  }
  return docs as DocRow[];
}

/** 截断到上限，保留头部（文档核心规则通常在前面） */
function cap(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '\n…（内容超长已截断）';
}

/**
 * L3 阶段段落抽取：若 FLOW 文档使用 "## [PHASE]" 或 "## 阶段：PHASE" 标题分段，
 * 只保留匹配当前 phase 的段落 + 无标记的通用段；无法识别时整篇注入。
 */
function extractPhaseSections(content: string, phase?: string): string {
  if (!phase) return content;
  const sections = content.split(/(?=^##\s)/m);
  if (sections.length <= 1) return content;
  const upper = phase.toUpperCase();
  const matched = sections.filter((s) => {
    const firstLine = (s.split('\n')[0] || '').toUpperCase();
    const hasAnyPhaseTag = /DIAGNOSTIC_TEST|PLANNING|GUIDED_TRAINING|FINAL_EXAM|COMPLETED/.test(firstLine);
    if (!hasAnyPhaseTag) return true; // 通用段保留
    return firstLine.includes(upper);
  });
  const result = matched.join('');
  return result.trim().length > 0 ? result : content;
}

/**
 * 装配分层上下文 system prompt。
 * 任何一层加载失败都不致命：跳过该层并记日志，保证 AI 调用总能进行。
 */
export async function buildAgentContext(input: AgentContextInput): Promise<AgentContextResult> {
  const { studentId, subject, phase, scene, sessionState } = input;
  const parts: string[] = [];
  const meta: AgentContextResult['meta'] = [];

  // ---------- L1 约束（永不裁剪） ----------
  try {
    const docs = await loadDocs('CONSTRAINT', subject);
    if (docs.length > 0) {
      const text = docs.map((d) => d.content.trim()).join('\n\n');
      parts.push(`# 一、行为约束（最高优先级，任何情况下不得违反）\n${text}`);
      meta.push({ layer: 'L1', title: docs.map((d) => d.title).join('、'), chars: text.length });
    }
  } catch (e) {
    logger.warn('agentContextBuilder L1 加载失败:', e);
  }

  // ---------- L2 角色指令 ----------
  // 学科专属角色指令：唯一权威源 = 科目指令配置（subjectInstruction 表），避免与智能体平台重复配置/冲突
  // 全局角色指令：智能体平台（agentDocument INSTRUCTION，subject=null）
  // 注：智能体平台中 subject 非空的 INSTRUCTION 文档已被「科目指令配置」取代，不再注入（仅告警）。
  try {
    const blocks: string[] = [];
    const metaTitles: string[] = [];
    let chars = 0;

    // 学科专属 AI 老师指令（科目指令配置，唯一权威源）
    if (subject) {
      const si = await prisma.subjectInstruction.findUnique({ where: { subject } });
      if (si?.systemPrompt?.trim()) {
        const text = cap(si.systemPrompt.trim(), LAYER_CAP.L2);
        blocks.push(`【${subject}学科 AI 老师】\n${text}`);
        metaTitles.push(`${subject}科目指令`);
        chars += text.length;
      }
    }

    // 全局角色指令（智能体平台，subject=null）
    const globalCap = subject ? 1500 : LAYER_CAP.L2;
    const globalDocs = await loadDocs('INSTRUCTION', null, false);
    if (globalDocs.length > 0) {
      const text = cap(globalDocs.map((d) => d.content.trim()).join('\n\n'), globalCap);
      blocks.push(`# 全局角色与教学指令\n${text}`);
      metaTitles.push('全局' + globalDocs.map((d) => d.title).join('、'));
      chars += text.length;
    }

    // 告警：智能体平台存在学科级 INSTRUCTION（已被科目指令配置取代，避免冲突）
    const conflictDocs = await prisma.agentDocument.findMany({
      where: { type: 'INSTRUCTION' as any, subject: { not: null }, enabled: true },
      select: { id: true, subject: true, title: true },
    });
    if (conflictDocs.length > 0) {
      logger.warn(
        'agentContextBuilder: 智能体平台存在学科级 INSTRUCTION 文档，已被「科目指令配置」取代（不再注入 L2，避免冲突）：',
        conflictDocs.map((d) => `${d.title}(${d.subject})`)
      );
    }

    if (blocks.length > 0) {
      parts.push(`# 二、角色与教学指令\n${blocks.join('\n\n')}`);
      meta.push({ layer: 'L2', title: metaTitles.join('、'), chars });
    }
  } catch (e) {
    logger.warn('agentContextBuilder L2 加载失败:', e);
  }

  // ---------- L3 流程文档（仅当前阶段段落） ----------
  try {
    const docs = await loadDocs('FLOW', subject);
    if (docs.length > 0) {
      const text = cap(
        docs.map((d) => extractPhaseSections(d.content.trim(), phase)).join('\n\n'),
        LAYER_CAP.L3
      );
      parts.push(`# 三、训练流程规范${phase ? `（当前阶段：${phase}）` : ''}\n${text}`);
      meta.push({ layer: 'L3', title: docs.map((d) => d.title).join('、'), chars: text.length });
    }
  } catch (e) {
    logger.warn('agentContextBuilder L3 加载失败:', e);
  }

  // ---------- L4 学员记忆（全局 + 该学科） ----------
  try {
    const memories = await prisma.studentMemory.findMany({
      where: {
        studentId,
        OR: subject ? [{ subject: null }, { subject }] : [{ subject: null }],
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (memories.length > 0) {
      const text = cap(
        memories
          .map((m) => `【${m.subject ? `${m.subject}学科记忆` : '全局记忆'}】\n${m.content.trim()}`)
          .join('\n\n'),
        LAYER_CAP.L4
      );
      parts.push(`# 四、学员长期记忆（跨任务积累，供个性化教学参考）\n${text}`);
      meta.push({ layer: 'L4', title: `${memories.length} 份记忆`, chars: text.length });
    }
  } catch (e) {
    logger.warn('agentContextBuilder L4 加载失败:', e);
  }

  // ---------- L5 学科学情摘要 ----------
  if (subject) {
    try {
      const s = await subjectLearningStateService.getSubjectSummary(studentId, subject);
      if (s.totalKnowledgePoints > 0 || s.errorTotal > 0) {
        const lines = [
          `学科：${s.subject}｜能力估计 θ：${s.irtTheta ?? '暂无'}｜知识点总数：${s.totalKnowledgePoints}｜已掌握(≥80分)：${s.masteredCount}｜错题总数：${s.errorTotal}`,
          s.weakPointsTop5.length > 0
            ? `薄弱点 TOP${s.weakPointsTop5.length}：${s.weakPointsTop5.map((w) => `${w.point}(${w.score}分)`).join('、')}`
            : '',
          s.recentTrend.length > 0
            ? `近期动态：${s.recentTrend.map((r) => `${r.point}[${r.trend}·${r.score}分]`).join('、')}`
            : '',
        ].filter(Boolean);
        const text = cap(lines.join('\n'), LAYER_CAP.L5);
        parts.push(`# 五、学科学情摘要（系统实测数据，出题与讲解需据此因材施教）\n${text}`);
        meta.push({ layer: 'L5', title: `${subject}学情摘要`, chars: text.length });
      }
    } catch (e) {
      logger.warn('agentContextBuilder L5 加载失败:', e);
    }
  }

  // ---------- L6 任务配置与会话状态 ----------
  if (scene || sessionState) {
    const text = cap(
      [scene ? `本次调用场景：${scene}` : '', sessionState || ''].filter(Boolean).join('\n'),
      LAYER_CAP.L6
    );
    parts.push(`# 六、当前任务与会话状态\n${text}`);
    meta.push({ layer: 'L6', title: '会话状态', chars: text.length });
  }

  // ---------- 总预算裁剪：从 L6 → L2 逆序压缩，L1 永不动 ----------
  let systemPrompt = parts.join('\n\n');
  if (systemPrompt.length > CHAR_BUDGET) {
    const l1 = parts.length > 0 && parts[0].startsWith('# 一、') ? parts[0] : '';
    const rest = l1 ? parts.slice(1) : [...parts];
    let overflow = systemPrompt.length - CHAR_BUDGET;
    for (let i = rest.length - 1; i >= 0 && overflow > 0; i--) {
      const keep = Math.max(300, rest[i].length - overflow);
      if (rest[i].length > keep) {
        overflow -= rest[i].length - keep;
        rest[i] = rest[i].slice(0, keep) + '\n…（预算不足已压缩）';
      }
    }
    systemPrompt = [l1, ...rest].filter(Boolean).join('\n\n');
  }

  return { systemPrompt, meta };
}

export const agentContextBuilder = { buildAgentContext };
