// 学员端错题管理服务
import { PrismaClient, MasteryLevel } from '@prisma/client';
import {
  initialReviewFields,
  getDueReviews as getDueReviewsFromSR,
  CYCLES_TO_MASTER,
} from './spacedRepetitionService';

const prisma = new PrismaClient();

interface GetErrorsParams {
  studentId: string;
  subject?: string;
  mastery?: MasteryLevel;
  page: number;
  limit: number;
}

/**
 * 获取错题列表（支持筛选和分页）
 */
export const getErrors = async (params: GetErrorsParams) => {
  const { studentId, subject, mastery, page, limit } = params;
  const skip = (page - 1) * limit;

  // 构建查询条件
  const where: any = {
    studentId,
  };

  if (subject) {
    where.subject = subject;
  }

  if (mastery) {
    where.mastery = mastery;
  }

  // 查询错题列表
  const [errors, total] = await Promise.all([
    prisma.errorQuestion.findMany({
      where,
      skip,
      take: limit,
      include: {
        question: {
          include: {
            materialNode: true,
          },
        },
        answer: true,
      },
      orderBy: {
        collectedAt: 'desc',
      },
    }),
    prisma.errorQuestion.count({ where }),
  ]);

  return {
    errors,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * 获取错题详情
 */
export const getErrorDetail = async (errorId: string, studentId: string) => {
  const error = await prisma.errorQuestion.findFirst({
    where: {
      id: errorId,
      studentId,
    },
    include: {
      question: {
        include: {
          materialNode: true,
        },
      },
      answer: true,
    },
  });

  if (!error) {
    throw new Error('错题不存在或无权访问');
  }

  return error;
};

/**
 * 创建错题重做会话
 */
export const createRetrySession = async (errorId: string, studentId: string) => {
  // 获取错题信息
  const error = await getErrorDetail(errorId, studentId);

  // 为错题重做创建一个临时任务（P3 双轨：统一收编为 SPECIAL + ERROR_BOOK 专项）
  const task = await prisma.task.create({
    data: {
      studentId,
      createdBy: studentId,
      title: `错题重做：${error.question.materialNode?.name || '练习'}`,
      mode: 'CUSTOM',
      category: 'SPECIAL',
      subject: error.subject,
      specialType: 'ERROR_BOOK',
      targetRef: { errorQuestionIds: [error.id] },
      config: {
        materialNodeIds: [error.question.materialNodeId],
        questionCount: 1,
        difficulty: error.question.difficulty,
      },
      status: 'IN_PROGRESS',
    },
  });

  // 创建训练会话用于错题重做
  const session = await prisma.trainingSession.create({
    data: {
      taskId: task.id,
      studentId,
      phase: 'TRAINING',
      currentStep: 0,
      totalSteps: 1,
      progress: 0,
      questions: [error.questionId],
      status: 'ACTIVE',
    },
    include: {
      student: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  // 更新错题的重做次数
  await prisma.errorQuestion.update({
    where: { id: errorId },
    data: {
      retryCount: {
        increment: 1,
      },
      lastRetryAt: new Date(),
    },
  });

  return session;
};

/**
 * 更新错题掌握度
 */
export const updateMastery = async (
  errorId: string,
  studentId: string,
  mastery: MasteryLevel
) => {
  // 验证错题是否属于该学员
  const error = await prisma.errorQuestion.findFirst({
    where: {
      id: errorId,
      studentId,
    },
  });

  if (!error) {
    throw new Error('错题不存在或无权访问');
  }

  // 防"伪掌握"守卫：只有连续 3 个艾宾浩斯复习周期均答对，才允许标记为 MASTERED
  // （短期记忆答对 1 次不等于真正掌握，见《业务逻辑与功能改善_1.md》建议 2）
  if (mastery === 'MASTERED' && error.consecutiveCorrect < CYCLES_TO_MASTER) {
    throw new Error(
      `该错题尚未通过间隔重复验证（已连续答对 ${error.consecutiveCorrect}/${CYCLES_TO_MASTER} 个复习周期），暂不能标记为彻底掌握`
    );
  }

  // 检查掌握度是否提升
  const masteryLevels = ['UNMASTERED', 'MASTERING', 'MASTERED'];
  const oldLevel = masteryLevels.indexOf(error.mastery);
  const newLevel = masteryLevels.indexOf(mastery);
  const isImproved = newLevel > oldLevel;

  // 更新掌握度
  const updated = await prisma.errorQuestion.update({
    where: { id: errorId },
    data: {
      mastery,
      updatedAt: new Date(),
    },
    include: {
      question: {
        include: {
          materialNode: true,
        },
      },
    },
  });

  // 如果掌握度提升，奖励积分
  if (isImproved) {
    // 获取当前积分余额
    const lastTransaction = await prisma.pointsTransaction.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    const currentBalance = lastTransaction?.balance || 0;
    const points = mastery === 'MASTERED' ? 10 : 5; // 完全掌握奖励 10 分，正在掌握奖励 5 分
    const newBalance = currentBalance + points;

    // 创建积分交易记录
    await prisma.pointsTransaction.create({
      data: {
        studentId,
        amount: points,
        type: 'ERROR_RETRY',
        relatedId: errorId,
        balance: newBalance,
      },
    });
  }

  return updated;
};

/**
 * 自动收集错题（在答题时调用）
 * 这个函数会在学员答错题目时被调用
 */
export const collectErrorQuestion = async (
  studentId: string,
  questionId: string,
  answerId: string,
  subject: string
) => {
  // 检查是否已经收集过这道错题
  const existing = await prisma.errorQuestion.findFirst({
    where: {
      studentId,
      questionId,
    },
  });

  // 如果已经存在，不重复收集
  if (existing) {
    return existing;
  }

  // 创建新的错题记录（进入艾宾浩斯第 1 天复习周期）
  const errorQuestion = await prisma.errorQuestion.create({
    data: {
      studentId,
      questionId,
      answerId,
      subject,
      mastery: 'UNMASTERED',
      retryCount: 0,
      ...initialReviewFields(),
    },
  });

  return errorQuestion;
};

/**
 * 获取今日到期待复习的错题（艾宾浩斯间隔重复）
 */
export const getDueReviews = async (studentId: string, limit = 20) => {
  return getDueReviewsFromSR(studentId, limit);
};

/**
 * 获取错题统计信息
 */
export const getErrorStats = async (studentId: string) => {
  const stats = await prisma.errorQuestion.groupBy({
    by: ['mastery'],
    where: {
      studentId,
    },
    _count: {
      id: true,
    },
  });

  const result = {
    unmastered: 0,
    mastering: 0,
    mastered: 0,
    total: 0,
  };

  stats.forEach((stat) => {
    const count = stat._count.id;
    result.total += count;

    switch (stat.mastery) {
      case 'UNMASTERED':
        result.unmastered = count;
        break;
      case 'MASTERING':
        result.mastering = count;
        break;
      case 'MASTERED':
        result.mastered = count;
        break;
    }
  });

  return result;
};
