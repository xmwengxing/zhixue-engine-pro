/**
 * 为学情概览创建测试数据
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedOverviewTestData() {
  try {
    console.log('开始创建学情概览测试数据...\n');

    // 1. 获取用户
    const parent = await prisma.user.findUnique({ where: { username: 'parent1' } });
    const student = await prisma.user.findUnique({ where: { username: 'student1' } });

    if (!parent || !student) {
      console.error('❌ 找不到测试用户，请先运行 seed-test-data.ts');
      return;
    }

    console.log('✓ 找到家长用户:', parent.username);
    console.log('✓ 找到学员用户:', student.username);

    // 2. 创建亲子关系
    const existingRelation = await prisma.parentChildRelation.findFirst({
      where: {
        parentId: parent.id,
        studentId: student.id,
      },
    });

    if (!existingRelation) {
      await prisma.parentChildRelation.create({
        data: {
          parentId: parent.id,
          studentId: student.id,
          relation: '父亲',
          status: 'ACTIVE',
        },
      });
      console.log('✓ 创建亲子关系');
    } else {
      console.log('✓ 亲子关系已存在');
    }

    // 3. 创建学员档案
    const existingProfile = await prisma.studentProfile.findUnique({
      where: { userId: student.id },
    });

    if (!existingProfile) {
      await prisma.studentProfile.create({
        data: {
          userId: student.id,
          realName: '张小明',
          gender: '男',
          grade: '初二',
          materialVersion: '人教版',
          subjectLevels: {
            语文: 'good',
            数学: 'excellent',
            英语: 'average',
            物理: 'good',
            化学: 'weak',
          },
          completeness: 80,
        },
      });
      console.log('✓ 创建学员档案');
    } else {
      console.log('✓ 学员档案已存在');
    }

    // 4. 创建教材节点（如果不存在）
    let mathSubject = await prisma.materialNode.findFirst({
      where: { name: '数学', type: 'SUBJECT' },
    });

    if (!mathSubject) {
      mathSubject = await prisma.materialNode.create({
        data: {
          name: '数学',
          type: 'SUBJECT',
          order: 1,
        },
      });
      console.log('✓ 创建数学科目节点');
    }

    let chineseSubject = await prisma.materialNode.findFirst({
      where: { name: '语文', type: 'SUBJECT' },
    });

    if (!chineseSubject) {
      chineseSubject = await prisma.materialNode.create({
        data: {
          name: '语文',
          type: 'SUBJECT',
          order: 0,
        },
      });
      console.log('✓ 创建语文科目节点');
    }

    // 5. 创建题目
    const mathQuestions = await prisma.question.findMany({
      where: { materialNodeId: mathSubject.id },
    });

    if (mathQuestions.length === 0) {
      for (let i = 1; i <= 5; i++) {
        await prisma.question.create({
          data: {
            materialNodeId: mathSubject.id,
            type: 'CHOICE',
            content: { question: `数学题目 ${i}`, options: ['A', 'B', 'C', 'D'] },
            answer: 'A',
            difficulty: 3,
            knowledgePoints: ['代数', '方程'],
          },
        });
      }
      console.log('✓ 创建 5 道数学题目');
    }

    const chineseQuestions = await prisma.question.findMany({
      where: { materialNodeId: chineseSubject.id },
    });

    if (chineseQuestions.length === 0) {
      for (let i = 1; i <= 5; i++) {
        await prisma.question.create({
          data: {
            materialNodeId: chineseSubject.id,
            type: 'ESSAY',
            content: { question: `语文题目 ${i}` },
            answer: '标准答案',
            difficulty: 2,
            knowledgePoints: ['阅读理解', '写作'],
          },
        });
      }
      console.log('✓ 创建 5 道语文题目');
    }

    // 6. 创建任务
    const existingTask = await prisma.task.findFirst({
      where: { studentId: student.id },
    });

    let task;
    if (!existingTask) {
      task = await prisma.task.create({
        data: {
          studentId: student.id,
          createdBy: parent.id,
          title: '数学练习任务',
          mode: 'CUSTOM',
          config: {
            materialNodeIds: [mathSubject.id],
            questionCount: 5,
            difficulty: 3,
          },
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 天前
          completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // 30 分钟后
        },
      });
      console.log('✓ 创建任务');
    } else {
      task = existingTask;
      console.log('✓ 任务已存在');
    }

    // 7. 创建训练会话
    const existingSession = await prisma.trainingSession.findFirst({
      where: { taskId: task.id },
    });

    let session;
    if (!existingSession) {
      const allQuestions = await prisma.question.findMany({
        where: { materialNodeId: mathSubject.id },
        take: 5,
      });

      session = await prisma.trainingSession.create({
        data: {
          taskId: task.id,
          studentId: student.id,
          phase: 'TRAINING',
          currentStep: 5,
          totalSteps: 5,
          progress: 100,
          questions: allQuestions.map((q) => q.id),
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
        },
      });
      console.log('✓ 创建训练会话');
    } else {
      session = existingSession;
      console.log('✓ 训练会话已存在');
    }

    // 8. 创建答题记录
    const existingAnswers = await prisma.answer.findMany({
      where: { sessionId: session.id },
    });

    if (existingAnswers.length === 0) {
      const questions = await prisma.question.findMany({
        where: { id: { in: session.questions } },
      });

      for (let i = 0; i < questions.length; i++) {
        const isCorrect = i < 3; // 前 3 题正确，后 2 题错误
        await prisma.answer.create({
          data: {
            sessionId: session.id,
            questionId: questions[i].id,
            studentAnswer: isCorrect ? questions[i].answer : '错误答案',
            isCorrect,
            timeSpent: 60 + Math.floor(Math.random() * 120),
            attemptCount: 1,
          },
        });
      }
      console.log('✓ 创建 5 条答题记录（3 对 2 错）');
    } else {
      console.log('✓ 答题记录已存在');
    }

    // 9. 创建错题
    const wrongAnswers = await prisma.answer.findMany({
      where: {
        sessionId: session.id,
        isCorrect: false,
      },
      include: {
        question: true,
      },
    });

    for (const answer of wrongAnswers) {
      const existingError = await prisma.errorQuestion.findFirst({
        where: {
          studentId: student.id,
          questionId: answer.questionId,
        },
      });

      if (!existingError) {
        await prisma.errorQuestion.create({
          data: {
            studentId: student.id,
            questionId: answer.questionId,
            answerId: answer.id,
            subject: '数学',
            mastery: 'UNMASTERED',
            retryCount: 0,
          },
        });
      }
    }
    console.log(`✓ 创建 ${wrongAnswers.length} 道错题`);

    // 10. 创建今天的训练会话（用于连续学习统计）
    const todaySession = await prisma.trainingSession.findFirst({
      where: {
        studentId: student.id,
        completedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    if (!todaySession) {
      const todayTask = await prisma.task.create({
        data: {
          studentId: student.id,
          createdBy: parent.id,
          title: '今日练习',
          mode: 'CUSTOM',
          config: {
            materialNodeIds: [chineseSubject.id],
            questionCount: 3,
            difficulty: 2,
          },
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 20 * 60 * 1000),
          completedAt: new Date(),
        },
      });

      const chineseQs = await prisma.question.findMany({
        where: { materialNodeId: chineseSubject.id },
        take: 3,
      });

      await prisma.trainingSession.create({
        data: {
          taskId: todayTask.id,
          studentId: student.id,
          phase: 'TRAINING',
          currentStep: 3,
          totalSteps: 3,
          progress: 100,
          questions: chineseQs.map((q) => q.id),
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 20 * 60 * 1000),
          completedAt: new Date(),
        },
      });

      console.log('✓ 创建今日训练会话（用于连续学习统计）');
    }

    console.log('\n✅ 学情概览测试数据创建完成！');
    console.log('\n现在可以测试学情概览 API 了');
  } catch (error) {
    console.error('❌ 创建测试数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedOverviewTestData();
