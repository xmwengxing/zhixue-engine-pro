import { TaskStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { prisma } from '../lib/prisma';

/**
 * 自定义配置接口
 */
export interface CustomConfig {
  title: string;
  aiTeacher: string; // AI 科目老师 ID
  subject: string; // 科目
  materialVersion: string; // 教材版本
  units: string[]; // 单元列表(支持多选)
  goal: string; // 任务目标
  personality?: string; // 性格特征(选填)
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

      // 构建查询条件
      const where: any = {
        createdBy: parentId,
      };

      if (studentId) {
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
          },
        }),
        prisma.task.count({ where }),
      ]);

      return {
        tasks,
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
            },
          },
        },
      });

      if (!task) {
        throw new Error('任务不存在');
      }

      // 验证权限
      if (task.createdBy !== parentId) {
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

        const { title, aiTeacher, subject, materialVersion, units, goal, personality } = data.customConfig;

        // 验证 AI 科目老师是否存在
        const subjectInstruction = await prisma.subjectInstruction.findUnique({
          where: { id: aiTeacher },
        });

        if (!subjectInstruction) {
          throw new Error('AI 科目老师不存在');
        }

        // 查找教材节点
        const materialNodes = await this.findMaterialNodes(subject, materialVersion, units);

        if (materialNodes.length === 0) {
          throw new Error('未找到匹配的教材内容');
        }

        // 组装任务配置
        taskTitle = title;
        taskSubject = subject;
        taskConfig = {
          mode: 'CUSTOM',
          aiTeacher,
          subject,
          materialVersion,
          units,
          goal,
          personality,
          materialNodeIds: materialNodes.map(n => n.id),
        };

        // 组装 AI 指令(将在 aiServiceManager 中使用)
        aiInstruction = this.assembleAIInstruction(
          subjectInstruction.systemPrompt,
          goal,
          personality,
          null
        );

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
          throw new Error(
            `该学员的「${taskSubject}」学科已有进行中的总任务（${existingMain.title}），` +
              '同一学科同时只允许 1 个学科总任务。请先完成或删除现有任务，或改为发布专项攻克任务。'
          );
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
      specialType: 'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK';
      /** UNIT：单元节点 id 列表 */
      unitIds?: string[];
      /** KNOWLEDGE_POINT：知识点列表 */
      knowledgePoints?: string[];
      /** ERROR_BOOK：错题 id 列表（不传则自动取该学科未掌握错题） */
      errorQuestionIds?: string[];
      /** 抽题数量（UNIT/KNOWLEDGE_POINT 生效，默认 10，1-50） */
      questionCount?: number;
      title?: string;
    }
  ) {
    // 校验亲子关系
    const relation = await prisma.parentChildRelation.findFirst({
      where: { parentId, studentId: data.studentId, status: 'ACTIVE' },
    });
    if (!relation) {
      throw new Error('无权为该学员创建任务');
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
      });
      if (questionIds.length === 0) {
        throw new Error('题库中没有符合条件的题目，请调整筛选条件或先在题库中导入题目');
      }
      title = exam.title || `${subject}随机练习卷（${questionIds.length} 题）`;
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
   * 查找教材节点
   * @param subject 科目
   * @param materialVersion 教材版本
   * @param units 单元列表
   * @returns 教材节点列表
   */
  private async findMaterialNodes(subject: string, materialVersion: string, units: string[]) {
    try {
      // 查找版本节点
      const versionNode = await prisma.materialNode.findFirst({
        where: {
          type: 'VERSION',
          name: materialVersion,
        },
      });

      logger.info(`查找版本节点: ${materialVersion}, 结果: ${versionNode ? versionNode.id : '未找到'}`);

      if (!versionNode) {
        throw new Error(`未找到教材版本: ${materialVersion}`);
      }

      // 查找科目节点(可能在VERSION下,也可能在GRADE下)
      // 先尝试直接在VERSION下查找
      let subjectNode = await prisma.materialNode.findFirst({
        where: {
          type: 'SUBJECT',
          name: subject,
          parentId: versionNode.id,
        },
      });

      // 如果没找到,尝试在GRADE节点下查找
      if (!subjectNode) {
        const gradeNodes = await prisma.materialNode.findMany({
          where: {
            type: 'GRADE',
            parentId: versionNode.id,
          },
        });

        for (const gradeNode of gradeNodes) {
          subjectNode = await prisma.materialNode.findFirst({
            where: {
              type: 'SUBJECT',
              name: subject,
              parentId: gradeNode.id,
            },
          });
          if (subjectNode) break;
        }
      }

      logger.info(`查找科目节点: ${subject}, 结果: ${subjectNode ? subjectNode.id : '未找到'}`);

      if (!subjectNode) {
        throw new Error(`未找到科目: ${subject}`);
      }

      // 查找单元节点
      const materialNodes = await prisma.materialNode.findMany({
        where: {
          type: 'UNIT',
          name: {
            in: units,
          },
          parentId: subjectNode.id,
        },
      });

      logger.info(`查找单元节点: ${units.join(', ')}, 父节点: ${subjectNode.id}, 结果数量: ${materialNodes.length}`);

      if (materialNodes.length === 0) {
        throw new Error('未找到匹配的单元');
      }

      return materialNodes;
    } catch (error) {
      logger.error('查找教材节点失败:', error);
      throw error;
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
   * 删除任务
   * @param taskId 任务 ID
   * @param parentId 家长 ID（用于权限验证）
   * @returns 删除结果
   */
  async deleteTask(taskId: string, parentId: string) {
    try {
      // 查询任务，包含学员信息
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          student: true, // 包含学员信息，检查学员是否被删除
          trainingSessions: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (!task) {
        throw new Error('任务不存在');
      }

      // 验证权限：只有创建者可以删除
      if (task.createdBy !== parentId) {
        throw new Error('无权删除该任务');
      }

      // 检查学员是否已被删除
      const studentDeleted = !task.student || task.student.status === 'DELETED';

      // 如果学员未被删除，执行正常的删除检查
      if (!studentDeleted) {
        // 检查任务状态：进行中的任务不能删除
        if (task.status === 'IN_PROGRESS') {
          throw new Error('进行中的任务不能删除，请等待任务完成或联系管理员');
        }

        // 检查是否有关联的活跃训练会话
        const hasActiveSessions = task.trainingSessions.some(
          session => session.status === 'ACTIVE'
        );

        if (hasActiveSessions) {
          throw new Error('该任务有正在进行的训练会话，无法删除');
        }
      } else {
        // 学员已被删除，允许直接删除任务
        logger.info(`任务 ${taskId} 的学员已被删除，允许删除任务`);
      }

      // 删除任务（级联删除会自动处理关联的训练会话、报告等）
      await prisma.task.delete({
        where: { id: taskId },
      });

      logger.info(`任务删除成功: ${taskId}, 家长: ${parentId}${studentDeleted ? ' (学员已删除)' : ''}`);

      return {
        success: true,
        message: '任务删除成功',
      };
    } catch (error) {
      logger.error('删除任务失败:', error);
      throw error;
    }
  }

  /**
   * 设置家长激励寄语（存储于 task.config.parentEncouragement）
   */
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
