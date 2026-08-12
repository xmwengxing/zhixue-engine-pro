import { TaskStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { ConflictError } from '../middlewares/errorHandler';
import { prisma } from '../lib/prisma';

/**
 * 自定义配置接口
 */
export interface CustomConfig {
  title: string;
  aiTeacher: string; // AI 科目老师 ID
  subject: string; // 科目（从管理员已添加教材的学科中选择）
  /** 教材节点 id（TEXTBOOK 节点），下拉自动识别，不允许手填 */
  textbookId: string;
  /** 单元节点 id 列表（UNIT 节点，多选），下拉自动识别 */
  unitIds: string[];
  /** 兼容旧字段：教材版本 / 单元名（展示用，由 textbookId 推导） */
  materialVersion?: string;
  units?: string[];
  goal: string; // 任务目标
  personality?: string; // 性格特征(选填)
  /**
   * 水平评估试卷（初测）：从「初测与水平评估」题库选取套卷或 AI 自动组卷。
   * - { source: 'PAPER', paperId } 手动选卷
   * - { source: 'AI' } AI 自动从初测库组卷
   * - null/undefined 不设置，按教材自动出题
   */
  assessment?: { source: 'PAPER' | 'AI'; paperId?: string } | null;
  /**
   * 期末目标正确率（%）：学科总任务延续模式的归档达标线。
   * 归档时校验最近一次期末考正确率 ≥ goalScore，未设置则仅要求期末考完成。
   */
  goalScore?: number;
}

/**
 * 档案配置接口
 */
export interface ProfileConfig {
  aiTeacher: string; // AI 科目老师 ID
  trainingGoal?: string; // 训练目标（选填）
  diagnosticQuestionCount?: number; // 诊断测试题目数量（5-20，默认10）
  tempOverrides?: {
    school?: string;
    learningFoundation?: string;
    interests?: string;
  };
}

/**
 * 组卷配置接口（EXAM_PAPER 模式）
 */
export interface ExamPaperConfig {
  /** PAPER=整卷发布, RANDOM=随机抽题组卷 */
  source: 'PAPER' | 'RANDOM';
  /** source=PAPER 时必填：已发布的试卷 ID */
  paperId?: string;
  /** source=RANDOM 时必填：科目 */
  subject?: string;
  /** source=RANDOM 时必填：抽题数量（1-50） */
  questionCount?: number;
  /** source=RANDOM 可选：限定题型 */
  types?: string[];
  /** source=RANDOM 可选：难度范围 */
  difficultyMin?: number;
  difficultyMax?: number;
  /** source=RANDOM 可选：限定知识点 */
  knowledgePoints?: string[];
  /** source=RANDOM 可选：按教材年级过滤（如 "8"） */
  grade?: string;
  /** source=RANDOM 可选：按学期过滤（UP=上 / DOWN=下） */
  term?: string;
  /** source=RANDOM 可选：按单元节点 id 过滤（多选） */
  unitIds?: string[];
  /** source=RANDOM 可选：组卷蓝图（难度分布/知识点覆盖/题型配额，双向细目表） */
  blueprint?: import('./questionBankService').ExamBlueprint;
  /** 可选：任务标题（默认取试卷名或自动生成） */
  title?: string;
}

/**
 * 初始测试来源配置（P2 题库化初测）
 * - PAPER：直接选一份已发布试卷作为初测
 * - CRITERIA：家长手动指定筛题条件
 * - AI：AI 根据学员信息自动产出筛题条件（默认）
 */
export interface InitialTestOption {
  source: 'PAPER' | 'CRITERIA' | 'AI';
  paperId?: string;
  criteria?: {
    grade?: string;
    term?: string;
    version?: string;
    unitIds?: string[];
    knowledgePoints?: string[];
    difficultyDist?: Record<string, number>;
  };
}

/**
 * 创建任务请求接口
 */
export interface CreateTaskRequest {
  mode: 'CUSTOM' | 'PROFILE' | 'EXAM_PAPER';
  studentId: string;
  customConfig?: CustomConfig;
  profileConfig?: ProfileConfig;
  examConfig?: ExamPaperConfig;
  /** 初始测试来源（PROFILE 模式生效；不传默认 AI 自动筛题） */
  initialTest?: InitialTestOption;
  /** 家长激励寄语（可选，<=200 字） */
  parentEncouragement?: string;
  /** 每日训练体量约束（可选）：{ questions: 每日题数, minutes: 每日时长分钟 } */
  dailyGoal?: { questions?: number | null; minutes?: number | null };
  /**
   * P3 双轨（内部使用）：任务大类，默认 SUBJECT_MAIN。
   * smartAssign 等日常巩固通道传 SPECIAL，不占用 Q1 总任务名额。
   */
  category?: 'SUBJECT_MAIN' | 'SPECIAL';
  /** P3 双轨（内部使用）：专项类型（仅 category=SPECIAL） */
  specialType?: 'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK';
  /** P3 双轨（内部使用）：专项目标引用 */
  targetRef?: Record<string, unknown>;
}

/**
 * 家长端任务管理服务
 */
export class ParentTaskService {
  /**
   * 获取家长名下所有有效绑定学员 ID
   * 说明：家长端「可见任务」统一按亲子关系判定（与 ownership 中间件一致），
   * 而非按 task.createdBy，避免管理员代建 / 系统派单的任务对家长不可见，
   * 也保证首页统计与任务列表口径一致。
   */
  private async getBoundStudentIds(parentId: string): Promise<string[]> {
    const relations = await prisma.parentChildRelation.findMany({
      where: { parentId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    return relations.map((r) => r.studentId);
  }

  /**
   * 获取可用的 AI 科目老师列表
   * @returns AI 科目老师列表
   */
  async getAITeachers() {
    try {
      const aiTeachers = await prisma.subjectInstruction.findMany({
        select: {
          id: true,
          subject: true,
          updatedAt: true,
        },
        orderBy: {
          subject: 'asc',
        },
      });

      return aiTeachers;
    } catch (error) {
      logger.error('获取 AI 科目老师列表失败:', error);
      throw new Error('获取 AI 科目老师列表失败');
    }
  }

  /**
   * 获取任务列表
   * @param parentId 家长 ID
   * @param filters 筛选条件
   * @returns 任务列表和总数
   */
  async getTasks(
    parentId: string,
    filters: {
      studentId?: string;
      status?: TaskStatus;
      /** P3 双轨：任务大类过滤（SUBJECT_MAIN=学科总任务 / SPECIAL=专项攻克） */
      category?: 'SUBJECT_MAIN' | 'SPECIAL';
      /** P3 双轨：学科过滤 */
      subject?: string;
      page?: number;
      limit?: number;
    }
  ) {
    try {
      const { studentId, status, category, subject, page = 1, limit = 10 } = filters;

      // 构建查询条件：亲子关系可见 ∪ 本人创建（与 ownership 中间件、首页统计口径一致）
      const boundStudentIds = await this.getBoundStudentIds(parentId);

      const where: any = {
        OR: [{ studentId: { in: boundStudentIds } }, { createdBy: parentId }],
      };

      if (studentId) {
        // 已由 validateOwnership 校验归属，这里收窄到单个学员
        where.studentId = studentId;
      }

      if (status) {
        where.status = status;
      }

      if (category) {
        where.category = category;
      }

      if (subject) {
        where.subject = subject;
      }

      // 计算分页
      const skip = (page - 1) * limit;

      // 并行查询任务列表和总数
      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            student: {
              select: {
                id: true,
                username: true,
                studentProfile: {
                  select: {
                    realName: true,
                  },
                },
              },
            },
            // 学期延续模式：最近一次训练时间（防中断提示用）
            trainingSessions: {
              select: { startedAt: true, status: true },
              orderBy: { startedAt: 'desc' },
              take: 1,
            },
            archive: {
              select: { id: true, semesterLabel: true, summaryText: true, archivedAt: true },
            },
          },
        }),
        prisma.task.count({ where }),
      ]);

      // 压缩为列表返回结构：仅带最近训练时间与归档摘要，不暴露 session 明细
      const list = tasks.map((t: any) => {
        const { trainingSessions, ...rest } = t;
        return {
          ...rest,
          lastTrainedAt: trainingSessions?.[0]?.startedAt ?? null,
        };
      });

      // 附带最近专项训练记录（历史任务表正确率/摘要）
      const { attachLastRecords } = await import('./taskDeletionService');
      const listWithRecords = await attachLastRecords(list);

      return {
        tasks: listWithRecords,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('获取任务列表失败:', error);
      throw new Error('获取任务列表失败');
    }
  }

  /**
   * 获取单个任务详情
   * @param taskId 任务 ID
   * @param parentId 家长 ID（用于权限验证）
   * @returns 任务详情
   */
  async getTaskById(taskId: string, parentId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              studentProfile: {
                select: {
                  realName: true,
                  grade: true,
                  materialVersion: true,
                },
              },
            },
          },
          trainingSessions: {
            select: {
              id: true,
              phase: true,
              progress: true,
              status: true,
              startedAt: true,
              completedAt: true,
              totalSteps: true,
              currentStep: true,
            },
            orderBy: { startedAt: 'desc' },
          },
          reports: {
            select: {
              id: true,
              generatedAt: true,
              subject: true,
              category: true,
              specialType: true,
            },
            orderBy: { generatedAt: 'desc' },
          },
          creator: {
            select: { id: true, username: true, realName: true, role: true },
          },
        },
      });

      if (!task) {
        throw new Error('任务不存在');
      }

      // 验证权限：亲子关系 或 本人创建（学员被删/解绑后仍可查看自己建的任务）
      const boundStudentIds = await this.getBoundStudentIds(parentId);
      if (!boundStudentIds.includes(task.studentId) && task.createdBy !== parentId) {
        throw new Error('无权访问该任务');
      }

      return task;
    } catch (error) {
      logger.error('获取任务详情失败:', error);
      throw error;
    }
  }

  /**
   * 创建任务
   * @param parentId 家长 ID
   * @param data 任务数据
   * @returns 创建的任务
   */
  async createTask(parentId: string, data: CreateTaskRequest) {
    try {
      // 验证学员是否存在
      const student = await prisma.user.findUnique({
        where: { id: data.studentId },
        include: {
          studentProfile: true,
        },
      });

      if (!student || student.role !== 'STUDENT') {
        throw new Error('学员不存在');
      }

      // 验证家长是否有权为该学员创建任务
      const relation = await prisma.parentChildRelation.findFirst({
        where: {
          parentId,
          studentId: data.studentId,
          status: 'ACTIVE',
        },
      });

      if (!relation) {
        throw new Error('无权为该学员创建任务');
      }

      let taskTitle: string;
      let taskConfig: any;
      let aiInstruction: string;
      let taskSubject: string | null = null; // P3 双轨：任务归属学科
      // 学期延续模式：水平评估（初测）配置，函数级声明（CUSTOM 分支内赋值，Q1/新学期校验复用）
      let assessmentConfig: { source: 'PAPER' | 'AI'; paperId?: string } | null = null;

      if (data.mode === 'EXAM_PAPER') {
        // 组卷模式：整卷发布 或 随机抽题
        if (!data.examConfig) {
          throw new Error('组卷模式需要提供 examConfig');
        }
        const exam = await this.buildExamPaperTask(data.examConfig);
        taskTitle = exam.title;
        taskConfig = exam.config;
        aiInstruction = exam.aiInstruction;
        taskSubject = (exam.config as any).subject ?? null;
      } else if (data.mode === 'CUSTOM') {
        // 自定义配置模式
        if (!data.customConfig) {
          throw new Error('自定义模式需要提供 customConfig');
        }

        const {
          title,
          aiTeacher,
          subject,
          textbookId,
          unitIds,
          goal,
          personality,
          assessment,
          goalScore,
        } = data.customConfig;

        // 验证 AI 科目老师是否存在
        const subjectInstruction = await prisma.subjectInstruction.findUnique({
          where: { id: aiTeacher },
        });

        if (!subjectInstruction) {
          throw new Error('AI 科目老师不存在');
        }

        // 教材 / 单元必须从管理员已添加教材中下拉选择（节点 id），不允许手填
        if (!textbookId || !Array.isArray(unitIds) || unitIds.length === 0) {
          throw new Error('请选择教材版本并至少勾选一个单元');
        }

        // 解析教材与单元：以 TEXTBOOK + UNIT 节点 id 为准（修复旧 VERSION 树查找失效问题）
        const { ensureSubjectNode } = await import('./questionBankService');
        const textbook = await prisma.materialNode.findUnique({
          where: { id: textbookId },
          include: { children: true },
        });
        if (!textbook || textbook.type !== 'TEXTBOOK') {
          throw new Error('所选教材不存在');
        }
        const subjectNodeId = await ensureSubjectNode(subject);
        const validUnitIds = (unitIds as string[]).filter((id) =>
          textbook.children.some((c: any) => c.id === id && c.type === 'UNIT')
        );
        if (validUnitIds.length === 0) {
          throw new Error('请至少选择一个有效单元');
        }
        const tbMeta = (textbook.metadata ?? {}) as any;
        const unitNames = validUnitIds
          .map((id) => (textbook.children.find((c: any) => c.id === id)?.metadata as any)?.name)
          .filter(Boolean);

        // 校验水平评估配置（若有）
        assessmentConfig = null;
        if (assessment && (assessment.source === 'PAPER' || assessment.source === 'AI')) {
          if (assessment.source === 'PAPER' && !assessment.paperId) {
            throw new Error('水平评估选卷模式需要提供 paperId');
          }
          assessmentConfig = { source: assessment.source, paperId: assessment.paperId };
        }

        // 期末目标正确率（0-100，可选）
        if (goalScore !== undefined && goalScore !== null) {
          if (typeof goalScore !== 'number' || goalScore < 1 || goalScore > 100) {
            throw new Error('期末目标正确率必须在 1-100 之间');
          }
        }

        // 组装任务配置
        taskTitle = title;
        taskSubject = subject;
        taskConfig = {
          mode: 'CUSTOM',
          aiTeacher,
          subject,
          textbookId,
          materialVersion: tbMeta.version ?? null,
          grade: tbMeta.grade ?? null,
          term: tbMeta.term ?? null,
          unitIds: validUnitIds,
          units: unitNames,
          goal,
          personality,
          goalScore: goalScore ?? null, // 期末归档达标线（可空）
          // 兼容：题目 materialNodeId 指向 SUBJECT 节点，generateQuestions 按此 + unitIds 取题
          materialNodeIds: [subjectNodeId],
          assessment: assessmentConfig,
        };

        // 组装 AI 指令(将在 aiServiceManager 中使用)
        aiInstruction = this.assembleAIInstruction(
          subjectInstruction.systemPrompt,
          goal,
          personality,
          null
        );

        // 学习路径方法论（edu-learning-path）：把文字目标拆解为分阶段目标（phasedGoals）。
        // 具体异步调用在任务创建后触发（见 createTask 末尾），失败降级保持 null 不阻塞发布
        taskConfig.phasedGoals = null;

      } else {
        // 档案提取模式
        if (!data.profileConfig) {
          throw new Error('档案模式需要提供 profileConfig');
        }

        if (!student.studentProfile) {
          throw new Error('学员档案不完整，无法使用档案模式');
        }

        const { aiTeacher, trainingGoal, diagnosticQuestionCount, tempOverrides } = data.profileConfig;

        // 验证 AI 科目老师是否存在
        const subjectInstruction = await prisma.subjectInstruction.findUnique({
          where: { id: aiTeacher },
        });

        if (!subjectInstruction) {
          throw new Error('AI 科目老师不存在');
        }

        // 验证诊断题目数量（如果提供）
        const finalDiagnosticQuestionCount = diagnosticQuestionCount || 10; // 默认 10 题
        if (finalDiagnosticQuestionCount < 5 || finalDiagnosticQuestionCount > 20) {
          throw new Error('诊断题目数量必须在 5-20 之间');
        }

        // 基于档案生成任务配置
        const generatedConfig = await this.generateTaskFromProfile(
          student.studentProfile,
          tempOverrides,
          trainingGoal // 传递训练目标
        );

        taskSubject = subjectInstruction.subject;

        // P2 题库化初测：发布任务时从题库预抽初始测试题（废弃逐题 AI 生成）
        const { buildInitialTest } = await import('./questionSelectionService');
        const initialTestOpt = data.initialTest ?? { source: 'AI' as const };
        const initialTest = await buildInitialTest(
          initialTestOpt.source === 'PAPER'
            ? { source: 'PAPER', paperId: initialTestOpt.paperId }
            : initialTestOpt.source === 'CRITERIA'
              ? {
                  source: 'CRITERIA',
                  criteria: {
                    subject: subjectInstruction.subject,
                    count: finalDiagnosticQuestionCount,
                    grade: initialTestOpt.criteria?.grade,
                    term: initialTestOpt.criteria?.term,
                    version: initialTestOpt.criteria?.version,
                    unitIds: initialTestOpt.criteria?.unitIds,
                    knowledgePoints: initialTestOpt.criteria?.knowledgePoints,
                    difficultyDist: initialTestOpt.criteria?.difficultyDist,
                  },
                }
              : {
                  source: 'AI',
                  ai: {
                    studentId: data.studentId,
                    subject: subjectInstruction.subject,
                    count: finalDiagnosticQuestionCount,
                  },
                }
        );

        taskTitle = generatedConfig.title;
        taskConfig = {
          mode: 'PROFILE',
          aiTeacher,
          trainingGoal, // 保存训练目标
          diagnosticQuestionCount: initialTest.questionIds.length, // 以实际抽到的题量为准
          initialTest: {
            ...initialTest.meta,
            questionIds: initialTest.questionIds,
          },
          studentProfileSnapshot: { // 保存学员档案快照，用于后续 AI 生成
            realName: student.studentProfile.realName,
            gender: student.studentProfile.gender,
            grade: student.studentProfile.grade,
            school: tempOverrides?.school || student.studentProfile.school,
            materialVersion: student.studentProfile.materialVersion,
            learningFoundation: tempOverrides?.learningFoundation || student.studentProfile.learningFoundation,
            interests: tempOverrides?.interests || student.studentProfile.interests,
            subjectLevels: student.studentProfile.subjectLevels,
          },
          ...generatedConfig.config, // 包含 profileBased: true
          tempOverrides,
        };

        // 组装 AI 指令，使用用户提供的训练目标
        aiInstruction = this.assembleAIInstruction(
          subjectInstruction.systemPrompt,
          trainingGoal || generatedConfig.goal, // 优先使用用户提供的训练目标
          null,
          student.studentProfile.learningFoundation
        );
      }

      // 家长激励寄语（可选）
      const encouragement = (data.parentEncouragement || '').trim();
      if (encouragement.length > 200) {
        throw new Error('激励寄语不能超过 200 字');
      }

      // 每日训练体量约束（可选）：写入任务配置，训练舱日程表 + 终测前置校验使用
      if (data.dailyGoal && (data.dailyGoal.questions || data.dailyGoal.minutes)) {
        const { validateDailyGoal } = await import('./dailyTrainingService');
        taskConfig.dailyGoal = validateDailyGoal(data.dailyGoal);
      }

      // ===== P3 双轨 Q1 约束：同一学科同时只允许 1 个进行中的学科总任务 =====
      const taskCategory = data.category ?? 'SUBJECT_MAIN';
      if (taskCategory === 'SUBJECT_MAIN' && taskSubject) {
        const existingMain = await prisma.task.findFirst({
          where: {
            studentId: data.studentId,
            category: 'SUBJECT_MAIN',
            subject: taskSubject,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          select: { id: true, title: true, status: true },
        });
        if (existingMain) {
          // 业务约束冲突属于 409，不是 500 —— 否则前端会当成「服务器炸了」而不是提示用户
          throw new ConflictError(
            `该学员的「${taskSubject}」学科已有进行中的总任务（${existingMain.title}），` +
              '同一学科同时只允许 1 个学科总任务。请先完成或删除现有任务，或改为发布专项攻克任务。',
            { existingTaskId: existingMain.id, subject: taskSubject }
          );
        }
      }

      // ===== 学期延续模式：新学期重新初测 + 归档总结注入 AI 指令 =====
      if (taskCategory === 'SUBJECT_MAIN' && taskSubject && data.mode === 'CUSTOM') {
        const prevArchive = await prisma.taskArchive.findFirst({
          where: { studentId: data.studentId, subject: taskSubject },
          orderBy: { archivedAt: 'desc' },
          select: { id: true, summaryText: true, semesterLabel: true, archivedAt: true },
        });
        // 存在历史归档/已完成总任务 → 新学期必须重新初测评估（避免中断超过一学期仍无评估）
        if (prevArchive) {
          if (!assessmentConfig) {
            throw new ConflictError(
              `该学员的「${taskSubject}」已有 ${prevArchive.semesterLabel} 学期的归档记录，` +
                '新学期开始需要先进行水平评估初测（可选 AI 自动组卷或手动选卷），请配置「水平评估试卷」后再发布。',
              { prevArchiveId: prevArchive.id, subject: taskSubject }
            );
          }
        } else {
          const prevCompleted = await prisma.task.findFirst({
            where: {
              studentId: data.studentId,
              category: 'SUBJECT_MAIN',
              subject: taskSubject,
              status: 'COMPLETED',
            },
            select: { id: true, completedAt: true },
          });
          // 历史任务已结束但未归档 → 同样视为需要重新初测的延续场景
          if (prevCompleted && !assessmentConfig) {
            throw new ConflictError(
              `该学员的「${taskSubject}」学科已有结束的历史总任务，新学期开始需要先进行水平评估初测，` +
                '请配置「水平评估试卷」（AI 自动组卷或手动选卷）后再发布。',
              { prevTaskId: prevCompleted.id, subject: taskSubject }
            );
          }
        }
        // 有上期归档 → 把压缩后的学期总结注入 AI 指令，替代全量历史（降 token）
        if (prevArchive) {
          const summarySnippet = (prevArchive.summaryText || '').trim().slice(0, 800);
          if (summarySnippet) {
            aiInstruction =
              (aiInstruction || '') +
              `\n\n【上学期归档总结（${prevArchive.semesterLabel}）】\n${summarySnippet}\n` +
              '请结合上学期归档总结评估学员既有掌握情况，避免重复讲解已掌握知识点。';
          }
          taskConfig.prevArchiveId = prevArchive.id;
        }
      }

      // 创建任务（P3 双轨：默认学科总任务；专项攻克任务由专项通道创建）
      const task = await prisma.task.create({
        data: {
          studentId: data.studentId,
          createdBy: parentId,
          title: taskTitle,
          mode: data.mode,
          category: taskCategory,
          subject: taskSubject,
          specialType: taskCategory === 'SPECIAL' ? (data.specialType ?? null) : null,
          targetRef: taskCategory === 'SPECIAL' && data.targetRef ? (data.targetRef as any) : undefined,
          config: {
            ...taskConfig,
            aiInstruction, // 保存组装好的 AI 指令
            ...(encouragement ? { parentEncouragement: encouragement } : {}),
          } as any,
          status: 'PENDING',
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              studentProfile: {
                select: {
                  realName: true,
                },
              },
            },
          },
        },
      });

      logger.info(`任务创建成功: ${task.id}, 学员: ${data.studentId}, 模式: ${data.mode}`);

      // 学习路径方法论（edu-learning-path）：CUSTOM 任务把文字目标异步拆解为分阶段目标，
      // 失败降级保持 null 不阻塞发布；学员端训练舱按 20%/80% 切分点映射展示当前阶段目标
      if (taskCategory === 'SUBJECT_MAIN' && data.mode === 'CUSTOM' && taskSubject) {
        const customCfg = data.customConfig as CustomConfig;
        const goalText = customCfg?.goal;
        if (goalText) {
          this.enrichPhasedGoalsAsync(task.id, taskSubject, goalText).catch((e) =>
            logger.error(`分阶段目标拆解失败（保持降级）: task=${task.id}`, e)
          );
        }
      }

      return task;
    } catch (error) {
      logger.error('创建任务失败:', error);
      throw error;
    }
  }

  /**
   * P3 双轨：创建专项攻克任务（SPECIAL）
   *
   * 简化流程（Q5 决策）：跳过完整初测，直接从题库/错题本抽题，
   * 以 EXAM_PAPER 固定题目模式进入电子答题专区作答。
   * - UNIT：按单元抽题
   * - KNOWLEDGE_POINT：按知识点抽题
   * - ERROR_BOOK：从错题本取题（指定错题或自动取未掌握错题）
   *
   * 专项任务不占用 Q1 的"同学科 1 个进行中总任务"名额，数量不限。
   */
  async createSpecialTask(
    parentId: string,
    data: {
      studentId: string;
      subject: string;
      specialType: 'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK' | 'PAPER' | 'WORD';
      /** UNIT：单元节点 id 列表 */
      unitIds?: string[];
      /** KNOWLEDGE_POINT：知识点列表 */
      knowledgePoints?: string[];
      /** ERROR_BOOK：错题 id 列表（不传则自动取该学科未掌握错题） */
      errorQuestionIds?: string[];
      /** 抽题数量（UNIT/KNOWLEDGE_POINT/PAPER 生效，默认 10，1-50） */
      questionCount?: number;
      title?: string;
      /** PAPER：组卷配置（整卷或随机抽题） */
      examConfig?: ExamPaperConfig;
      /** WORD：单词攻克配置（mode/stage/orderMode/groupSize/intervalSec/roundSize） */
      wordConfig?: {
        mode: 'DICTATION' | 'SPELLING';
        stage: string;
        orderMode: 'SEQUENCE' | 'RANDOM';
        groupSize: number;
        intervalSec: number;
        roundSize: number;
      };
    },
    /** 学员主动发起（主动学习入口）：asStudent=true 时调用者即学员本人，跳过亲子关系校验 */
    options?: { asStudent?: boolean }
  ) {
    // 学员自建：仅允许为自己创建；家长：校验亲子关系
    if (options?.asStudent === true) {
      if (data.studentId !== parentId) {
        throw new Error('学员只能为自己创建专项任务');
      }
    } else {
      const relation = await prisma.parentChildRelation.findFirst({
        where: { parentId, studentId: data.studentId, status: 'ACTIVE' },
      });
      if (!relation) {
        throw new Error('无权为该学员创建任务');
      }
    }

    if (!data.subject) {
      throw new Error('专项任务必须指定学科');
    }

    const questionBankService = await import('./questionBankService');
    let questionIds: string[] = [];
    let targetRef: any = {};
    let defaultTitle = '';
    const count = data.questionCount ?? 10;
    if (count < 1 || count > 50) {
      throw new Error('抽题数量必须在 1-50 之间');
    }

    if (data.specialType === 'UNIT') {
      if (!data.unitIds || data.unitIds.length === 0) {
        throw new Error('单元专项需要选择至少一个单元');
      }
      questionIds = await questionBankService.pickRandomQuestions({
        subject: data.subject,
        count,
        unitIds: data.unitIds,
      });
      if (questionIds.length === 0) {
        throw new Error('所选单元下题库暂无题目，请先在题库导入题目或更换单元');
      }
      // 解析单元名用于标题
      const unitNodes = await prisma.materialNode.findMany({
        where: { id: { in: data.unitIds } },
        select: { name: true },
      });
      targetRef = { unitIds: data.unitIds, unitNames: unitNodes.map((u) => u.name) };
      defaultTitle = `${data.subject}单元专项 · ${unitNodes.map((u) => u.name).slice(0, 2).join('、')}${unitNodes.length > 2 ? '等' : ''}`;
    } else if (data.specialType === 'KNOWLEDGE_POINT') {
      if (!data.knowledgePoints || data.knowledgePoints.length === 0) {
        throw new Error('知识点专项需要选择至少一个知识点');
      }
      questionIds = await questionBankService.pickRandomQuestions({
        subject: data.subject,
        count,
        knowledgePoints: data.knowledgePoints,
      });
      if (questionIds.length === 0) {
        throw new Error('所选知识点下题库暂无题目，请更换知识点或先导入题目');
      }
      targetRef = { knowledgePoints: data.knowledgePoints };
      defaultTitle = `${data.subject}知识点专项 · ${data.knowledgePoints.slice(0, 2).join('、')}${data.knowledgePoints.length > 2 ? '等' : ''}`;
    } else if (data.specialType === 'ERROR_BOOK') {
      let errors;
      if (data.errorQuestionIds && data.errorQuestionIds.length > 0) {
        errors = await prisma.errorQuestion.findMany({
          where: {
            id: { in: data.errorQuestionIds },
            studentId: data.studentId,
          },
          select: { id: true, questionId: true },
        });
        if (errors.length === 0) {
          throw new Error('所选错题不存在或不属于该学员');
        }
      } else {
        // 自动取该学科未掌握错题（最近优先，最多 count 道）
        errors = await prisma.errorQuestion.findMany({
          where: {
            studentId: data.studentId,
            subject: data.subject,
            mastery: { not: 'MASTERED' },
          },
          orderBy: { updatedAt: 'desc' },
          take: count,
          select: { id: true, questionId: true },
        });
        if (errors.length === 0) {
          throw new Error(`该学员「${data.subject}」学科暂无未掌握的错题，无需错题攻克`);
        }
      }
      // 去重题目 id（同一题可能多次收录）
      questionIds = Array.from(new Set(errors.map((e) => e.questionId)));
      targetRef = { errorQuestionIds: errors.map((e) => e.id) };
      defaultTitle = `${data.subject}错题攻克 · ${questionIds.length} 题`;
    } else if (data.specialType === 'PAPER') {
      // 题库组卷专项：复用 EXAM_PAPER 构建逻辑（整卷或随机抽题），但归类为专项攻克
      if (!data.examConfig) {
        throw new Error('题库组卷专项需要提供 examConfig');
      }
      const built = await this.buildExamPaperTask(data.examConfig);
      questionIds = (built.config as any).questionIds ?? [];
      if (questionIds.length === 0) {
        throw new Error('组卷结果为空，请调整筛选条件或先导入题目');
      }
      targetRef = {
        source: data.examConfig.source,
        paperId: (built.config as any).paperId ?? null,
        randomFilter: (built.config as any).randomFilter ?? null,
      };
      defaultTitle = built.title || `${data.subject}题库组卷专项`;
      // 用专项一致的 config（source 标记 SPECIAL，便于与单元/知识点专项目录统一归类）
      const specialConfig: any = {
        ...(built.config as any),
        source: 'SPECIAL',
        specialType: 'PAPER',
      };
      // 直接写入任务配置，跳过下方通用 config 组装
      const paperTask = await prisma.task.create({
        data: {
          studentId: data.studentId,
          createdBy: parentId,
          title: data.title || defaultTitle,
          mode: 'EXAM_PAPER',
          category: 'SPECIAL',
          subject: data.subject,
          specialType: 'PAPER',
          targetRef,
          config: specialConfig,
          status: 'PENDING',
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              studentProfile: { select: { realName: true } },
            },
          },
        },
      });
      logger.info(
        `专项题库组卷任务创建成功: ${paperTask.id}, 学员 ${data.studentId}, 学科 ${data.subject}, 题量 ${questionIds.length}`
      );
      return paperTask;
    } else if (data.specialType === 'WORD') {
      // 英语单词攻克：听写/默写，老师固定 AI 词汇老师
      const wordTaskService = await import('./wordTaskService');
      const wc = wordTaskService.validateWordConfig(data.wordConfig);
      const count = await prisma.word.count({ where: { stage: wc.stage } });
      if (count === 0) {
        throw new Error(`「${wc.stage}」阶段词库为空，请先导入词库`);
      }
      const teacher = await wordTaskService.ensureWordTeacherInstruction();
      const wordTask = await prisma.task.create({
        data: {
          studentId: data.studentId,
          createdBy: parentId,
          title: data.title || `英语单词 · ${wc.mode === 'DICTATION' ? '听写' : '默写'}（${wc.stage}）`,
          mode: 'WORD',
          category: 'SPECIAL',
          subject: '英语',
          specialType: 'WORD',
          targetRef: { stage: wc.stage },
          config: {
            source: 'SPECIAL',
            specialType: 'WORD',
            ...wc,
            aiTeacherId: teacher.id,
          },
          status: 'PENDING',
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              studentProfile: { select: { realName: true } },
            },
          },
        },
      });
      logger.info(
        `专项单词任务创建成功: ${wordTask.id}, 学员 ${data.studentId}, 阶段 ${wc.stage}, 模式 ${wc.mode}`
      );
      return wordTask;
    } else {
      throw new Error('无效的专项类型');
    }

    // 组装 AI 批改指令（叠加对应学科老师系统提示）
    const subjectInstruction = await prisma.subjectInstruction.findFirst({
      where: { subject: { contains: data.subject } },
    });
    const basePrompt =
      subjectInstruction?.systemPrompt ||
      `你是一位耐心细致的${data.subject}老师，负责批改学生的答卷并给出讲解。`;
    const typeLabel =
      data.specialType === 'UNIT' ? '单元专项' : data.specialType === 'KNOWLEDGE_POINT' ? '知识点专项' : '错题攻克专项';
    const aiInstruction = `${basePrompt}\n\n## 任务说明\n本任务为「${typeLabel}」攻克任务（固定题目，来自题库${data.specialType === 'ERROR_BOOK' ? '错题本' : ''}），请根据标准答案批改学生作答：客观题严格比对，主观题按要点给分。批改讲解时紧扣本次专项目标，指出学生在该专项上的薄弱环节与改进方法。`;

    const title = data.title || defaultTitle;

    const task = await prisma.task.create({
      data: {
        studentId: data.studentId,
        createdBy: parentId,
        title,
        mode: 'EXAM_PAPER',
        category: 'SPECIAL',
        subject: data.subject,
        specialType: data.specialType,
        targetRef,
        config: {
          mode: 'EXAM_PAPER',
          source: 'SPECIAL',
          subject: data.subject,
          specialType: data.specialType,
          questionIds,
          questionCount: questionIds.length,
          aiTeacher: subjectInstruction?.id,
          aiInstruction,
        } as any,
        status: 'PENDING',
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            studentProfile: { select: { realName: true } },
          },
        },
      },
    });

    logger.info(
      `专项攻克任务创建成功: ${task.id}, 学员 ${data.studentId}, 类型 ${data.specialType}, 学科 ${data.subject}, 题量 ${questionIds.length}`
    );

    return task;
  }

  /**
   * P3 双轨：获取子女的错题列表（错题集专项的多选来源）
   */
  async listChildErrors(parentId: string, studentId: string, subject?: string) {
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      throw new Error('无权查看该学员的错题');
    }

    const errors = await prisma.errorQuestion.findMany({
      where: {
        studentId,
        ...(subject ? { subject } : {}),
        mastery: { not: 'MASTERED' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        question: {
          select: { id: true, content: true, type: true, difficulty: true, knowledgePoints: true },
        },
      },
    });

    return errors.map((e) => {
      const content = (e.question?.content ?? {}) as any;
      const stem = String(content?.stem ?? content?.title ?? content?.text ?? '');
      return {
        id: e.id,
        questionId: e.questionId,
        subject: e.subject,
        mastery: e.mastery,
        retryCount: e.retryCount,
        stem: stem.slice(0, 80),
        type: e.question?.type,
        difficulty: e.question?.difficulty,
        knowledgePoints: e.question?.knowledgePoints ?? [],
      };
    });
  }

  /**
   * P3 双轨：获取子女的薄弱知识点候选（知识点专项的带出来源）
   * 现阶段从未掌握错题聚合；P4 学情档案落地后改读 SubjectLearningState
   */
  async listChildWeakPoints(parentId: string, studentId: string, subject?: string) {
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      throw new Error('无权查看该学员的学情');
    }

    const errors = await prisma.errorQuestion.findMany({
      where: {
        studentId,
        ...(subject ? { subject } : {}),
        mastery: { not: 'MASTERED' },
      },
      include: { question: { select: { knowledgePoints: true } } },
      take: 200,
    });

    const countMap: Record<string, number> = {};
    for (const e of errors) {
      for (const p of e.question?.knowledgePoints ?? []) {
        countMap[p] = (countMap[p] || 0) + 1;
      }
    }

    return Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([point, errorCount]) => ({ point, errorCount }));
  }

  /**
   * 构建组卷模式（EXAM_PAPER）任务配置
   * - PAPER：取已发布试卷的题目（保持原顺序与分值）
   * - RANDOM：按条件从题库随机抽题
   */
  private async buildExamPaperTask(exam: ExamPaperConfig) {
    const questionBankService = await import('./questionBankService');

    let subject: string;
    let questionIds: string[] = [];
    let scores: Record<string, number> | undefined;
    let title: string;
    let paperId: string | undefined;

    if (exam.source === 'PAPER') {
      if (!exam.paperId) {
        throw new Error('整卷模式需要提供 paperId');
      }
      const paper = await questionBankService.getPaper(exam.paperId);
      if (!paper) {
        throw new Error('试卷不存在');
      }
      if (paper.status !== 'PUBLISHED') {
        throw new Error('该试卷尚未发布，无法用于布置任务');
      }
      if (paper.items.length === 0) {
        throw new Error('该试卷没有题目');
      }
      subject = paper.subject;
      paperId = paper.id;
      questionIds = paper.items.map((it) => it.questionId);
      scores = Object.fromEntries(paper.items.map((it) => [it.questionId, it.score]));
      title = exam.title || paper.title;
    } else {
      if (!exam.subject) {
        throw new Error('随机组卷需要指定科目');
      }
      const count = exam.questionCount ?? 10;
      if (count < 1 || count > 50) {
        throw new Error('抽题数量必须在 1-50 之间');
      }
      subject = exam.subject;
      questionIds = await questionBankService.pickRandomQuestions({
        subject,
        count,
        types: exam.types as any,
        difficultyMin: exam.difficultyMin,
        difficultyMax: exam.difficultyMax,
        knowledgePoints: exam.knowledgePoints,
        grade: exam.grade,
        term: exam.term,
        unitIds: exam.unitIds,
        blueprint: exam.blueprint,
      });
      if (questionIds.length === 0) {
        throw new Error('题库中没有符合条件的题目，请调整筛选条件或先在题库中导入题目');
      }
      const mins = exam.blueprint?.estimatedMinutes;
      title = exam.title || `${subject}随机练习卷（${questionIds.length} 题${mins ? `，约 ${mins} 分钟` : ''}）`;
    }

    // 组装 AI 批改指令（若配置了对应科目老师则叠加其系统提示）
    const subjectInstruction = await prisma.subjectInstruction.findFirst({
      where: { subject: { contains: subject } },
    });
    const basePrompt =
      subjectInstruction?.systemPrompt ||
      `你是一位耐心细致的${subject}老师，负责批改学生的答卷并给出讲解。`;
    const aiInstruction = `${basePrompt}\n\n## 任务说明\n本任务为固定题目的答题任务（电子答题专区），题目来自题库，请根据标准答案批改学生作答：客观题严格比对，主观题按要点给分并给出具体的改进建议。`;

    return {
      title,
      config: {
        mode: 'EXAM_PAPER',
        source: exam.source,
        subject,
        paperId,
        questionIds,
        questionCount: questionIds.length,
        scores,
        aiTeacher: subjectInstruction?.id,
        randomFilter:
          exam.source === 'RANDOM'
            ? {
                types: exam.types,
                difficultyMin: exam.difficultyMin,
                difficultyMax: exam.difficultyMax,
                knowledgePoints: exam.knowledgePoints,
                grade: exam.grade,
                term: exam.term,
                unitIds: exam.unitIds,
                blueprint: exam.blueprint, // 组卷蓝图（难度分布/知识点覆盖/题型配额）
              }
            : undefined,
      },
      aiInstruction,
    };
  }

  /**
   * 基于学员档案生成任务配置
   * @param profile 学员档案
   * @param tempOverrides 临时修改(仅用于当前任务)
   * @param trainingGoal 用户指定的训练目标(可选)
   * @returns 生成的任务配置
   */
  private async generateTaskFromProfile(profile: any, tempOverrides?: any, trainingGoal?: string) {
    try {
      // 使用临时修改或档案中的值
      const effectiveProfile = {
        realName: profile.realName || '未填写',
        gender: profile.gender || '未填写',
        grade: profile.grade || '未填写',
        school: tempOverrides?.school || profile.school || '未填写',
        materialVersion: profile.materialVersion || '未填写',
        learningFoundation: tempOverrides?.learningFoundation || profile.learningFoundation || '未填写',
        interests: tempOverrides?.interests || profile.interests || '未填写',
        subjectLevels: profile.subjectLevels || {},
      };

      logger.info(`基于档案生成任务配置:`, effectiveProfile);

      // 构建档案描述文本，用于传递给 AI
      const profileDescription = `
学员档案信息：
- 姓名：${effectiveProfile.realName}
- 性别：${effectiveProfile.gender}
- 年级：${effectiveProfile.grade}
- 学校：${effectiveProfile.school}
- 教材版本：${effectiveProfile.materialVersion}
- 学习基础：${effectiveProfile.learningFoundation}
- 兴趣爱好：${effectiveProfile.interests}
- 科目水平：${JSON.stringify(effectiveProfile.subjectLevels, null, 2)}
      `.trim();

      // 使用用户提供的训练目标，或生成默认目标
      const finalGoal = trainingGoal 
        ? `${trainingGoal}\n\n${profileDescription}` 
        : `基于学员档案自动生成的个性化训练任务\n\n${profileDescription}`;

      // 生成任务标题
      const title = trainingGoal 
        ? `${effectiveProfile.grade} - ${trainingGoal.substring(0, 30)}` 
        : `${effectiveProfile.grade} - 智能训练任务`;

      logger.info(`生成任务配置: 标题=${title}`);

      return {
        title,
        goal: finalGoal,
        config: {
          // 档案提取模式不需要指定具体的教材节点
          // AI 会根据档案信息和训练目标自动生成合适的内容
          materialNodeIds: [],
          questionCount: 10, // 默认题目数
          difficulty: 3, // 默认难度（中等）
          subject: '综合',
          materialVersion: effectiveProfile.materialVersion,
          grade: effectiveProfile.grade,
          profileBased: true, // 标记这是基于档案生成的任务
        },
      };
    } catch (error) {
      logger.error('基于档案生成任务失败:', error);
      throw new Error('基于档案生成任务失败');
    }
  }

  /**
   * 组装 AI 指令
   * @param systemPrompt 科目指令(第一级)
   * @param goal 任务目标(第二级)
   * @param personality 性格特征(可选)
   * @param learningFoundation 学习基础(可选)
   * @returns 组装好的 AI 指令
   */
  private assembleAIInstruction(
    systemPrompt: string,
    goal: string,
    personality: string | null | undefined,
    learningFoundation: string | null | undefined
  ): string {
    // 第一级: 管理员配置的科目指令
    let instruction = systemPrompt;

    // 第二级: 家长的任务配置
    instruction += `\n\n## 任务目标\n${goal}`;

    if (personality) {
      instruction += `\n\n## 学员性格特征\n${personality}`;
    }

    if (learningFoundation) {
      instruction += `\n\n## 学习基础\n${learningFoundation}`;
    }

    return instruction;
  }

  /**
   * 学期延续模式：家长调整学科总任务的单元范围（全量替换勾选）
   *
   * 学员在校学完新单元后，家长勾选新单元发起「继续训练」；支持随时调整
   * （追加新单元或移出已学单元）。仅 SUBJECT_MAIN 的 PENDING/IN_PROGRESS 任务可调整。
   * 当前进行中的 session 题集已固定不受影响，学员下一轮训练按新单元范围出题。
   */
  async updateTaskUnits(taskId: string, parentId: string, unitIds: string[]) {
    try {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) throw new Error('任务不存在');

      // 权限：亲子关系 或 本人创建
      const boundStudentIds = await this.getBoundStudentIds(parentId);
      if (!boundStudentIds.includes(task.studentId) && task.createdBy !== parentId) {
        throw new Error('无权调整该任务');
      }

      if (task.category !== 'SUBJECT_MAIN') {
        throw new ConflictError('仅学科总任务支持调整单元范围，专项任务请直接发布新任务');
      }
      if (task.status === 'COMPLETED' || task.archivedAt) {
        throw new ConflictError('任务已结束/归档，无法调整单元，请发布新学期任务');
      }

      const config = (task.config ?? {}) as any;
      const textbookId = config.textbookId;
      if (!textbookId) {
        throw new Error('该任务未绑定教材，无法调整单元');
      }
      if (!Array.isArray(unitIds) || unitIds.length === 0) {
        throw new Error('请至少勾选一个单元');
      }

      // 校验单元属于该任务绑定的教材（TEXTBOOK 节点的 UNIT 子节点）
      const textbook = await prisma.materialNode.findUnique({
        where: { id: textbookId },
        include: { children: true },
      });
      if (!textbook || textbook.type !== 'TEXTBOOK') {
        throw new Error('任务绑定的教材不存在');
      }
      const validUnitIds = unitIds.filter((id) =>
        textbook.children.some((c: any) => c.id === id && c.type === 'UNIT')
      );
      if (validUnitIds.length === 0) {
        throw new Error('请选择该教材下有效的单元');
      }
      const unitNames = validUnitIds
        .map((id) => (textbook.children.find((c: any) => c.id === id)?.metadata as any)?.name)
        .filter(Boolean);

      // 记录单元追加历史（unitHistory），供家长端展示「第 N 轮加入」
      const prevUnits = Array.isArray(config.unitIds) ? config.unitIds : [];
      const newlyAdded = validUnitIds.filter((id) => !prevUnits.includes(id));
      const unitHistory = Array.isArray(config.unitHistory)
        ? config.unitHistory
        : prevUnits.map((id: string) => ({ unitId: id, addedAt: task.createdAt.toISOString() }));
      if (newlyAdded.length > 0) {
        const now = new Date().toISOString();
        newlyAdded.forEach((id) => unitHistory.push({ unitId: id, addedAt: now }));
      }

      await prisma.task.update({
        where: { id: taskId },
        data: {
          config: {
            ...config,
            unitIds: validUnitIds,
            units: unitNames,
            unitHistory,
          } as any,
        },
      });

      logger.info(
        `任务 ${taskId} 单元范围调整：${prevUnits.length} → ${validUnitIds.length}（新增 ${newlyAdded.length}）`
      );

      return { unitIds: validUnitIds, units: unitNames, newlyAdded };
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      logger.error('调整任务单元失败:', error);
      throw error;
    }
  }

  /**
   * 学期延续模式：归档学科总任务（一学期总结归档一次）
   *
   * 归档节点：该学期期末考训练结束并达成分数目标后，由家长手动触发。
   * - 校验：任务属于 SUBJECT_MAIN；无进行中训练会话；至少完成一次期末考（FINAL_EXAM）；
   *   若配置了期末目标正确率(goalScore)，最近一次期末正确率须达标。
   * - 落库：先写结构化统计归档（同步，保证归档即时可用），再异步生成 AI 学期总结
   *   （读取压缩后的会话统计而非全量题目，失败降级为规则文本）。
   * - 归档后任务置为 COMPLETED，释放「同学科 1 个进行中总任务」名额，
   *   新学期需重新创建任务并配置水平评估初测。
   */
  async archiveTask(taskId: string, parentId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          trainingSessions: {
            select: { id: true, phase: true, status: true, startedAt: true, completedAt: true, finalExamData: true },
          },
        },
      });
      if (!task) throw new Error('任务不存在');

      const boundStudentIds = await this.getBoundStudentIds(parentId);
      if (!boundStudentIds.includes(task.studentId) && task.createdBy !== parentId) {
        throw new Error('无权归档该任务');
      }

      if (task.category !== 'SUBJECT_MAIN') {
        throw new ConflictError('仅学科总任务支持学期归档');
      }
      if (task.archivedAt) {
        throw new ConflictError('该任务已归档，无需重复归档');
      }
      if (task.status === 'PENDING') {
        throw new ConflictError('任务尚未开始训练，无法归档');
      }

      // 无进行中的训练会话才可归档
      const activeSession = task.trainingSessions.find(
        (s) => s.status === 'ACTIVE' || s.status === 'PAUSED'
      );
      if (activeSession) {
        throw new ConflictError('学员有进行中的训练会话，请先完成或中断后再归档');
      }

      // 至少完成一次期末考训练（归档节点判定）
      const examSessions = task.trainingSessions.filter(
        (s) => s.phase === 'FINAL_EXAM' && s.status === 'COMPLETED' && (s.finalExamData as any)?.results
      );
      if (examSessions.length === 0) {
        throw new ConflictError('尚未完成期末考训练，无法归档。请先让学员完成综合考试训练');
      }

      const config = (task.config ?? {}) as any;
      const goalScore = typeof config.goalScore === 'number' ? config.goalScore : null;

      // 取最近一次期末考成绩
      const lastExam = examSessions[examSessions.length - 1];
      const finalExamResults = (lastExam.finalExamData as any).results;
      const finalExamAccuracy =
        typeof finalExamResults?.accuracy === 'number' ? finalExamResults.accuracy : null;

      // 达成分数目标校验（配置了目标才强制）
      if (goalScore !== null && (finalExamAccuracy === null || finalExamAccuracy < goalScore)) {
        throw new ConflictError(
          `期末考正确率 ${finalExamAccuracy ?? '--'}% 未达到目标 ${goalScore}%，暂不能归档。` +
            '请先完成达标训练，或调整任务目标后重试。',
          { finalExamAccuracy, goalScore }
        );
      }

      // ===== 聚合学期统计（结构化，供 AI 总结与新学期读取） =====
      const stats = await this.collectSemesterStats(task, config, examSessions);

      // 学期标签：按归档时间推算（上半年→春季学期，下半年→秋季学期）
      const semesterLabel = this.buildSemesterLabel(new Date());

      // 规则兜底总结（AI 失败时使用；先落库保证归档即时可用）
      const fallbackSummary = this.buildFallbackSummary(stats, semesterLabel, goalScore);

      const archive = await prisma.taskArchive.create({
        data: {
          taskId: task.id,
          studentId: task.studentId,
          subject: task.subject ?? '综合',
          semesterLabel,
          summaryText: fallbackSummary,
          summaryJson: stats as any,
          goalScore,
          finalExamAccuracy,
        },
      });

      // 任务归档：置 COMPLETED，释放名额
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: new Date(), archivedAt: new Date() },
      });

      // 异步 AI 生成学期总结（失败保持规则兜底文本，不阻断归档）
      this.enrichArchiveSummaryAsync(archive.id, task, stats, semesterLabel, goalScore).catch(
        (e) => logger.error('异步生成学期总结失败:', e)
      );

      logger.info(
        `任务 ${task.id} 已归档（${semesterLabel}），期末正确率 ${finalExamAccuracy ?? '--'}%，目标 ${goalScore ?? '未设置'}%`
      );

      return {
        archiveId: archive.id,
        semesterLabel,
        finalExamAccuracy,
        goalScore,
        summaryText: fallbackSummary,
        stats,
      };
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      logger.error('归档任务失败:', error);
      throw error;
    }
  }

  /**
   * 聚合学期统计：初测正确率、训练轮次、各轮正确率、错题知识点、已掌握点等
   */
  private async collectSemesterStats(
    task: any,
    config: any,
    examSessions: any[]
  ): Promise<Record<string, unknown>> {
    const sessions = task.trainingSessions;
    const completed = sessions.filter((s: any) => s.status === 'COMPLETED');
    const examResults = examSessions.map((s: any) => (s.finalExamData as any).results);
    const lastExamResults = examResults[examResults.length - 1] || null;

    // 初测正确率：优先取 PRE_TEST 阶段 session 首段；CUSTOM 模式初测题在题集头部
    let initialTestAccuracy: number | null = null;
    const preTestSession = sessions.find((s: any) => s.phase === 'PRE_TEST');
    if (preTestSession) {
      const answers = await prisma.answer.findMany({
        where: { sessionId: preTestSession.id },
        select: { isCorrect: true },
      });
      if (answers.length > 0) {
        initialTestAccuracy =
          Math.round((answers.filter((a) => a.isCorrect).length / answers.length) * 1000) / 10;
      }
    }

    // 各轮次正确率：按会话聚合（含期末考）
    const rounds: { sessionId: string; startedAt: string; accuracy: number }[] = [];
    let totalAnswers = 0;
    for (const s of completed) {
      const answers = await prisma.answer.findMany({
        where: { sessionId: s.id },
        select: { isCorrect: true },
      });
      totalAnswers += answers.length;
      if (answers.length > 0) {
        rounds.push({
          sessionId: s.id,
          startedAt: s.startedAt.toISOString(),
          accuracy: Math.round((answers.filter((a) => a.isCorrect).length / answers.length) * 1000) / 10,
        });
      }
    }
    const avgAccuracy =
      rounds.length > 0
        ? Math.round((rounds.reduce((sum, r) => sum + r.accuracy, 0) / rounds.length) * 10) / 10
        : null;

    // 薄弱点 TOP5：优先用结构化优先级列表（gap/priority/urgency，见 subjectLearningStateService），
    // 无档案数据时回退为「最近 3 轮答错题的知识点频次」统计
    let weakPoints: string[] = [];
    try {
      const { getSubjectState, getWeakPointPriorityList } = await import(
        './subjectLearningStateService'
      );
      const stateObj = await getSubjectState(task.studentId, task.subject ?? '');
      weakPoints = getWeakPointPriorityList(stateObj, 5).map((w) => w.point);
    } catch {
      /* 学情档案读取失败，走频次兜底 */
    }
    if (weakPoints.length === 0) {
      const recentSessions = [...completed]
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, 3);
      const kpMiss = new Map<string, number>();
      for (const s of recentSessions) {
        const wrongAnswers = await prisma.answer.findMany({
          where: { sessionId: s.id, isCorrect: false },
          include: { question: { select: { knowledgePoints: true } } },
          take: 200,
        });
        for (const a of wrongAnswers) {
          const kps = (a.question as any)?.knowledgePoints;
          if (Array.isArray(kps)) {
            kps.forEach((kp: string) => kpMiss.set(kp, (kpMiss.get(kp) || 0) + 1));
          }
        }
      }
      weakPoints = [...kpMiss.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kp]) => kp);
    }

    const stats: Record<string, unknown> = {
      semesterLabel: this.buildSemesterLabel(new Date()),
      initialTestAccuracy,
      rounds: rounds.length,
      avgAccuracy,
      totalQuestions: totalAnswers,
      finalExamAccuracy: lastExamResults?.accuracy ?? null,
      finalExamCorrectCount: lastExamResults?.correctCount ?? null,
      finalExamTotalQuestions: lastExamResults?.totalQuestions ?? null,
      weakPoints,
      masteredPoints: (config as any).masteredPoints ?? [],
      units: Array.isArray(config.units) ? config.units : [],
    };
    return stats;
  }

  /** 学期标签：上半年→春季学期，下半年→秋季学期 */
  private buildSemesterLabel(date: Date): string {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    return m <= 7 ? `${y} 春季学期` : `${y} 秋季学期`;
  }

  /**
   * 学习路径方法论：把 CUSTOM 任务的文字目标异步拆解为分阶段目标（phasedGoals）。
   * - 产出：[{ stage, goal, knowledgePoints[], criteria[] }]（2-3 阶段，完成标准可自测）
   * - 降级：AI 失败/解析失败 → 保持 config.phasedGoals=null，不阻塞任务发布
   */
  private async enrichPhasedGoalsAsync(
    taskId: string,
    subject: string,
    goal: string
  ): Promise<void> {
    try {
      const { aiServiceManager } = await import('./aiServiceManager');
      const prompt =
        `请将以下 K12「${subject}」学科训练目标拆解为 2-3 个有序阶段，每阶段包含：` +
        '阶段名、可验证的阶段目标、核心知识点(2-4 个)、完成标准(1-2 条，可自测如"正确率达 70%")。\n' +
        `训练目标：${goal}\n` +
        '只输出 JSON 数组，格式：' +
        '[{"stage":"基础巩固","goal":"...","knowledgePoints":["..."],"criteria":["..."]}]';
      const text = String(
        await aiServiceManager.callAIWithSubject(subject, prompt, {
          maxTokens: 800,
          temperature: 0.5,
        })
      ).trim();
      // 健壮解析：剥掉 ```json 围栏，取首个 [ 到末尾 ]
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start < 0 || end <= start) {
        logger.warn(`[phasedGoals] AI 返回非 JSON，放弃拆解: task=${taskId}`);
        return;
      }
      const parsed = JSON.parse(text.slice(start, end + 1));
      const goals = Array.isArray(parsed)
        ? parsed
            .map((g: any) => ({
              stage: String(g?.stage ?? '').slice(0, 20),
              goal: String(g?.goal ?? '').slice(0, 200),
              knowledgePoints: Array.isArray(g?.knowledgePoints)
                ? g.knowledgePoints.slice(0, 6).map((k: any) => String(k).slice(0, 50))
                : [],
              criteria: Array.isArray(g?.criteria)
                ? g.criteria.slice(0, 3).map((c: any) => String(c).slice(0, 100))
                : [],
            }))
            .filter((g: any) => g.stage && g.goal)
            .slice(0, 3)
        : null;
      if (!goals || goals.length === 0) {
        logger.warn(`[phasedGoals] 拆解结果为空，放弃: task=${taskId}`);
        return;
      }
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) return;
      const config = (task.config ?? {}) as any;
      await prisma.task.update({
        where: { id: taskId },
        data: { config: { ...config, phasedGoals: goals } as any },
      });
      logger.info(`[phasedGoals] 目标拆解完成: task=${taskId}, 阶段数=${goals.length}`);
    } catch (error) {
      // 降级：不抛出，保持 phasedGoals=null
      logger.error(`[phasedGoals] 拆解失败（保持降级）: task=${taskId}`, error);
    }
  }

  /** 规则兜底总结（AI 失败/未配置时使用） */
  private buildFallbackSummary(
    stats: Record<string, unknown>,
    semesterLabel: string,
    goalScore: number | null
  ): string {
    const acc = (v: unknown) => (typeof v === 'number' ? `${v}%` : '--');
    return (
      `【${semesterLabel}学期总结】\n` +
      `初测正确率：${acc(stats.initialTestAccuracy)}\n` +
      `训练轮次：${stats.rounds} 轮，平均正确率：${acc(stats.avgAccuracy)}\n` +
      `期末考正确率：${acc(stats.finalExamAccuracy)}${goalScore ? `（目标 ${goalScore}%）` : ''}\n` +
      `薄弱知识点：${(stats.weakPoints as string[]).length ? (stats.weakPoints as string[]).join('、') : '暂无'}\n` +
      `覆盖单元：${(stats.units as string[]).length ? (stats.units as string[]).join('、') : '--'}`
    );
  }

  /** 异步 AI 生成学期总结：读压缩统计而非全量题目，失败保持规则兜底文本 */
  private async enrichArchiveSummaryAsync(
    archiveId: string,
    task: any,
    stats: Record<string, unknown>,
    semesterLabel: string,
    goalScore: number | null
  ): Promise<void> {
    try {
      const { aiServiceManager } = await import('./aiServiceManager');
      const prompt =
        `请为一名 K12 学员撰写「${task.subject ?? ''}」学科的学期学习总结（${semesterLabel}），` +
        `面向家长与学员，语气鼓励、简明（300 字内）${goalScore ? `，学期目标正确率 ${goalScore}%` : ''}。` +
        '基于以下结构化数据，突出进步与下学期建议：\n' +
        JSON.stringify(stats, null, 2);
      const text = await aiServiceManager.callAIWithSubject(task.subject ?? '综合', prompt, {
        maxTokens: 800,
        temperature: 0.7,
      });
      const clean = String(text || '').trim();
      if (clean) {
        await prisma.taskArchive.update({
          where: { id: archiveId },
          data: { summaryText: clean },
        });
        logger.info(`学期总结 AI 生成完成：${archiveId}`);
      }
    } catch (error) {
      // 保持规则兜底文本，不抛出
      logger.error('AI 学期总结生成失败，保留规则兜底:', error);
    }
  }

  /**
   * 删除任务
   * @param taskId 任务 ID
   * @param parentId 家长 ID（用于权限验证）
   * @returns 删除结果
   */
  async terminateTask(taskId: string, parentId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, studentId: true, createdBy: true } });
    if (!task) throw new Error('任务不存在');
    // 验证权限：亲子关系 或 本人创建
    const boundStudentIds = await this.getBoundStudentIds(parentId);
    if (!boundStudentIds.includes(task.studentId) && task.createdBy !== parentId) {
      throw new Error('无权操作该任务');
    }
    const { terminateTaskWithSessions } = await import('./taskDeletionService');
    return terminateTaskWithSessions(taskId);
  }

  async deleteTask(taskId: string, parentId: string) {
    try {
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, studentId: true, createdBy: true } });
      if (!task) throw new Error('任务不存在');
      // 验证权限：亲子关系 或 本人创建（学员被删/解绑后仍可清理自己建的任务）
      const boundStudentIds = await this.getBoundStudentIds(parentId);
      if (!boundStudentIds.includes(task.studentId) && task.createdBy !== parentId) {
        throw new Error('无权删除该任务');
      }
      // 复用公共删除逻辑（含 WordSession/SpecialTaskRecord/归档等依赖清理，保留积分流水）
      const { deleteTaskWithDeps } = await import('./taskDeletionService');
      const result = await deleteTaskWithDeps(taskId, { checkActive: true });
      logger.info(`任务删除成功: ${taskId}, 家长: ${parentId}`);
      return result;
    } catch (error: any) {
      logger.error('删除任务失败:', error);
      throw error;
    }
  }

  async setEncouragement(taskId: string, parentId: string, message: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new Error('任务不存在');
    }
    if (task.createdBy !== parentId) {
      throw new Error('无权操作该任务');
    }

    const trimmed = (message || '').trim();
    if (trimmed.length > 200) {
      throw new Error('激励寄语不能超过 200 字');
    }

    const config = (task.config as any) || {};
    config.parentEncouragement = trimmed;
    config.encouragementUpdatedAt = new Date().toISOString();

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { config },
    });

    logger.info(`家长 ${parentId} 更新任务 ${taskId} 的激励寄语`);

    return {
      taskId: updated.id,
      parentEncouragement: trimmed,
    };
  }

  /**
   * AI 生成激励批语草稿（创建任务前使用，无需已有任务）
   */
  async generateEncouragementDraft(parentId: string, studentId: string, goal?: string) {
    // 校验亲子绑定关系
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      throw new Error('无权操作该学员');
    }

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
    });

    const { aiServiceManager } = await import('./aiServiceManager');
    const { wrapUserInput } = await import('./aiPromptBuilder');

    const studentInfo = [
      `姓名：${profile?.realName || '孩子'}`,
      `年级：${profile?.grade || '未知'}`,
      `学习基础：${profile?.learningFoundation || '中等'}`,
      `学习目标：${goal || '提升学习能力'}`,
    ].join('\n');

    const prompt = `你是一位温暖的家庭教育顾问，请代家长为孩子写一段激励寄语。

${wrapUserInput('孩子与目标信息', studentInfo)}

要求：
1. 以家长第一人称口吻（如"孩子，爸爸妈妈想对你说"）
2. 温暖、具体、正向，联系学习目标
3. 50-80 字
4. 只输出寄语正文，不要任何其他内容`;

    const text = await aiServiceManager.callAI(prompt, {
      temperature: 0.8,
      maxTokens: 300,
      timeout: 15000,
    });

    return { suggestion: text.trim() };
  }

  /**
   * AI 生成定制激励批语（家长可再编辑后保存）
   */
  async generateEncouragement(taskId: string, parentId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        student: {
          include: { studentProfile: true },
        },
      },
    });

    if (!task) {
      throw new Error('任务不存在');
    }
    if (task.createdBy !== parentId) {
      throw new Error('无权操作该任务');
    }

    const profile = task.student?.studentProfile;
    const config = (task.config as any) || {};

    const { aiServiceManager } = await import('./aiServiceManager');
    const { wrapUserInput } = await import('./aiPromptBuilder');

    const studentInfo = [
      `姓名：${profile?.realName || '孩子'}`,
      `年级：${profile?.grade || '未知'}`,
      `学习基础：${profile?.learningFoundation || '中等'}`,
      `任务名称：${task.title}`,
      `学习目标：${config.trainingGoal || config.goal || '提升学习能力'}`,
    ].join('\n');

    const prompt = `你是一位温暖的家庭教育顾问，请代家长为孩子写一段激励寄语。

${wrapUserInput('孩子与任务信息', studentInfo)}

要求：
1. 以家长第一人称口吻（如"孩子，爸爸妈妈想对你说"）
2. 温暖、具体、正向，联系本次任务目标
3. 50-80 字，不要出现引号以外的标点滥用
4. 只输出寄语正文，不要任何其他内容`;

    const text = await aiServiceManager.callAI(prompt, {
      temperature: 0.8,
      maxTokens: 300,
      timeout: 15000,
    });

    return {
      taskId: task.id,
      suggestion: text.trim(),
    };
  }

  /**
   * AI 智能一键派单（教研降维）
   *
   * 家长只需点一下"一键布置今日巩固"，系统自动：
   * 1. 聚合孩子近 3 天错题分布（科目 + 知识点）
   * 2. 读取最近训练会话的 IRT 能力值与薄弱难度
   * 3. 结合学生档案自动生成一个 15 分钟提分小练任务（无需家长选知识点/难度）
   */
  async smartAssign(parentId: string, studentId: string) {
    // 校验亲子绑定关系
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      throw new Error('无权为该学员布置任务');
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    });
    if (!student || student.role !== 'STUDENT') {
      throw new Error('学员不存在');
    }
    if (!student.studentProfile) {
      throw new Error('学员档案不完整，请先完善学员档案');
    }

    // ===== 1. 聚合近 3 天错题分布 =====
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recentErrors = await prisma.errorQuestion.findMany({
      where: {
        studentId,
        mastery: { not: 'MASTERED' },
        OR: [
          { collectedAt: { gte: threeDaysAgo } },
          { updatedAt: { gte: threeDaysAgo } },
        ],
      },
      include: {
        question: { include: { materialNode: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    // 统计科目与知识点分布
    const subjectCount: Record<string, number> = {};
    const knowledgePointCount: Record<string, number> = {};
    for (const err of recentErrors) {
      subjectCount[err.subject] = (subjectCount[err.subject] || 0) + 1;
      const points = err.question?.knowledgePoints || [];
      for (const p of points) {
        knowledgePointCount[p] = (knowledgePointCount[p] || 0) + 1;
      }
      if (points.length === 0 && err.question?.materialNode?.name) {
        const name = err.question.materialNode.name;
        knowledgePointCount[name] = (knowledgePointCount[name] || 0) + 1;
      }
    }

    const topSubject =
      Object.entries(subjectCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topWeakPoints = Object.entries(knowledgePointCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([point]) => point);

    // ===== 2. 读取最近训练会话的 IRT 能力估计 =====
    const recentSession = await prisma.trainingSession.findFirst({
      where: { studentId, trainingProgress: { not: undefined } },
      orderBy: { startedAt: 'desc' },
      select: { trainingProgress: true },
    });
    const irt = (recentSession?.trainingProgress as any)?.irt;
    const abilityTheta: number | null =
      typeof irt?.theta === 'number' ? irt.theta : null;
    const abilityDesc =
      abilityTheta === null
        ? '暂无能力评估数据'
        : abilityTheta < -0.5
          ? '当前能力偏弱，需要基础巩固'
          : abilityTheta > 0.7
            ? '当前能力较强，可适度挑战'
            : '当前能力中等，稳步提升';

    // ===== 3. 选择 AI 科目老师（匹配错题最多的科目，否则取第一个可用） =====
    let subjectInstruction = null;
    if (topSubject) {
      subjectInstruction = await prisma.subjectInstruction.findFirst({
        where: { subject: { contains: topSubject } },
      });
    }
    if (!subjectInstruction) {
      subjectInstruction = await prisma.subjectInstruction.findFirst({
        orderBy: { subject: 'asc' },
      });
    }
    if (!subjectInstruction) {
      throw new Error('系统尚未配置 AI 科目老师，请联系管理员');
    }

    // ===== 4. 自动组装训练目标并复用 PROFILE 模式创建任务 =====
    const goalParts: string[] = ['15 分钟提分小练（AI 智能派单）'];
    if (topWeakPoints.length > 0) {
      goalParts.push(`重点巩固近期薄弱知识点：${topWeakPoints.join('、')}`);
    } else {
      goalParts.push('根据学员档案进行综合巩固训练');
    }
    goalParts.push(abilityDesc);
    const trainingGoal = goalParts.join('；');

    const task = await this.createTask(parentId, {
      mode: 'PROFILE',
      studentId,
      profileConfig: {
        aiTeacher: subjectInstruction.id,
        trainingGoal,
        diagnosticQuestionCount: 5, // 小练：最小诊断量，快速进入训练
      },
      // P3 双轨：每日巩固小练属专项性质（知识点攻克），不占用 Q1 学科总任务名额
      category: 'SPECIAL',
      specialType: 'KNOWLEDGE_POINT',
      targetRef: { knowledgePoints: topWeakPoints },
    });

    // 附加智能派单元数据（供报告与前端展示派单依据）
    const config = (task.config as any) || {};
    await prisma.task.update({
      where: { id: task.id },
      data: {
        title: `每日巩固 · ${topSubject || subjectInstruction.subject}提分小练`,
        config: {
          ...config,
          smartAssign: {
            assignedAt: new Date().toISOString(),
            errorCount: recentErrors.length,
            topSubject,
            weakPoints: topWeakPoints,
            abilityTheta,
          },
        },
      },
    });

    logger.info(
      `AI 智能派单成功: 任务 ${task.id}, 学员 ${studentId}, 近3天错题 ${recentErrors.length} 道, 薄弱点 [${topWeakPoints.join(',')}]`
    );

    return {
      task: { ...task, title: `每日巩固 · ${topSubject || subjectInstruction.subject}提分小练` },
      basis: {
        errorCount: recentErrors.length,
        topSubject,
        weakPoints: topWeakPoints,
        abilityTheta,
        abilityDesc,
      },
    };
  }
}

export const parentTaskService = new ParentTaskService();
