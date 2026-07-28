// 报告生成服务
import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { aiServiceManager } from './aiServiceManager';

const prisma = new PrismaClient();

/**
 * 报告内容接口
 */
interface ReportContent {
  summary: string; // 总结
  abilityAnalysis: {
    // 能力分析
    [knowledgePoint: string]: number; // 知识点掌握度 (0-100)
  };
  errorAnalysis: {
    // 错题分析
    questionId: string;
    reason: string;
    suggestion: string;
  }[];
  learningAdvice: string; // 学习建议
  statistics: {
    // 统计数据
    totalQuestions: number;
    correctCount: number;
    correctRate: number;
    avgTimeSpent: number;
    avgDifficulty: number;
  };
}

/**
 * 报告生成服务类
 */
export class ReportGenerationService {
  /**
   * 生成训练报告
   */
  async generateReport(sessionId: string): Promise<any> {
    try {
      logger.info(`开始生成报告: 会话 ${sessionId}`);

      // 动态导入以避免循环依赖
      const { reportStatusService } = await import('./reportStatusService');

      // 设置状态为生成中
      reportStatusService.setGenerating(sessionId, 10, '正在聚合报告数据...');

      // 1. 聚合报告数据
      const reportData = await this.aggregateReportData(sessionId);

      reportStatusService.setGenerating(sessionId, 40, '正在调用 AI 生成报告内容...');

      // 2. 生成 AI 报告内容
      const content = await this.generateAIReport(reportData);

      reportStatusService.setGenerating(sessionId, 80, '正在保存报告...');

      // 3. 保存报告到数据库
      const report = await this.saveReport(sessionId, reportData.studentId, reportData.taskId, content);

      reportStatusService.setCompleted(sessionId, report.id);

      // 4. 发送通知
      await this.sendReportNotification(report, reportData);

      logger.info(`报告生成完成: ${report.id}`);

      return report;
    } catch (error: any) {
      logger.error('生成报告失败:', error);

      // 设置状态为失败
      try {
        const { reportStatusService } = await import('./reportStatusService');
        reportStatusService.setFailed(sessionId, error.message || '未知错误');
      } catch {
        // 忽略状态更新错误
      }

      throw error;
    }
  }

  /**
   * 发送报告生成通知
   */
  private async sendReportNotification(report: any, reportData: any) {
    try {
      // 动态导入以避免循环依赖
      const { notificationService } = await import('./notificationService');

      // 获取任务标题
      const task = await prisma.task.findUnique({
        where: { id: reportData.taskId },
        select: { title: true },
      });

      const taskTitle = task?.title || '训练任务';

      // 发送通知
      await notificationService.notifyReportGenerated(
        reportData.studentId,
        report.id,
        taskTitle
      );

      logger.info(`报告生成通知已发送: 报告 ${report.id}`);
    } catch (error) {
      logger.error('发送报告生成通知失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 聚合报告数据
   */
  private async aggregateReportData(sessionId: string) {
    try {
      // 获取训练会话详情
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: {
            include: {
              creator: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          student: {
            include: {
              studentProfile: true,
            },
          },
          answers: {
            include: {
              question: {
                include: {
                  materialNode: {
                    include: {
                      parent: {
                        include: {
                          parent: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: {
              answeredAt: 'asc',
            },
          },
          aiConversations: {
            orderBy: {
              timestamp: 'asc',
            },
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.status !== 'COMPLETED') {
        throw new Error('训练会话未完成');
      }

      // 计算统计数据
      const totalQuestions = session.answers.length;
      const correctCount = session.answers.filter((a) => a.isCorrect).length;
      const correctRate = totalQuestions > 0 ? correctCount / totalQuestions : 0;
      const avgTimeSpent =
        totalQuestions > 0
          ? session.answers.reduce((sum, a) => sum + a.timeSpent, 0) / totalQuestions
          : 0;
      const avgDifficulty =
        totalQuestions > 0
          ? session.answers.reduce((sum, a) => sum + (a.question?.difficulty || 3), 0) /
            totalQuestions
          : 3;

      // 按知识点分组统计
      const knowledgePointStats = new Map<string, { correct: number; total: number }>();
      session.answers.forEach((answer) => {
        const knowledgePoints = answer.question?.knowledgePoints || [];
        knowledgePoints.forEach((kp) => {
          const stats = knowledgePointStats.get(kp) || { correct: 0, total: 0 };
          stats.total += 1;
          if (answer.isCorrect) {
            stats.correct += 1;
          }
          knowledgePointStats.set(kp, stats);
        });
      });

      // 收集错题
      const errorAnswers = session.answers.filter((a) => !a.isCorrect);

      // 获取科目信息
      const subject = await this.getSessionSubject(session);

      return {
        sessionId: session.id,
        studentId: session.studentId,
        taskId: session.taskId,
        studentName: session.student.username,
        subject,
        phase: session.phase,
        statistics: {
          totalQuestions,
          correctCount,
          correctRate,
          avgTimeSpent,
          avgDifficulty,
        },
        knowledgePointStats,
        errorAnswers,
        aiConversations: session.aiConversations,
        studentProfile: session.student.studentProfile,
      };
    } catch (error: any) {
      logger.error('聚合报告数据失败:', error);
      throw error;
    }
  }

  /**
   * 生成 AI 报告内容
   */
  private async generateAIReport(reportData: any): Promise<ReportContent> {
    try {
      // 构建 AI 提示词
      const prompt = this.buildReportPrompt(reportData);

      // 调用 AI 服务生成报告
      const aiResponse = await aiServiceManager.callAIWithSubject(
        reportData.subject,
        prompt,
        {
          maxTokens: 3000,
          temperature: 0.7,
        }
      );

      // 解析 AI 响应
      const content = this.parseAIResponse(aiResponse, reportData);

      return content;
    } catch (error: any) {
      logger.error('生成 AI 报告内容失败:', error);
      // 如果 AI 生成失败，返回基础报告
      return this.generateBasicReport(reportData);
    }
  }

  /**
   * 构建报告生成提示词
   */
  private buildReportPrompt(reportData: any): string {
    let prompt = `请根据以下学员训练数据，生成一份详细的学习分析报告。\n\n`;

    // 基本信息
    prompt += `## 基本信息\n`;
    prompt += `学员: ${reportData.studentName}\n`;
    prompt += `科目: ${reportData.subject}\n`;
    prompt += `训练阶段: ${this.getPhaseText(reportData.phase)}\n\n`;

    // 统计数据
    prompt += `## 统计数据\n`;
    prompt += `总题数: ${reportData.statistics.totalQuestions}\n`;
    prompt += `正确数: ${reportData.statistics.correctCount}\n`;
    prompt += `正确率: ${(reportData.statistics.correctRate * 100).toFixed(1)}%\n`;
    prompt += `平均用时: ${reportData.statistics.avgTimeSpent.toFixed(1)} 秒/题\n`;
    prompt += `平均难度: ${reportData.statistics.avgDifficulty.toFixed(1)}/5\n\n`;

    // 知识点掌握情况
    if (reportData.knowledgePointStats.size > 0) {
      prompt += `## 知识点掌握情况\n`;
      reportData.knowledgePointStats.forEach((stats: any, kp: string) => {
        const rate = (stats.correct / stats.total) * 100;
        prompt += `- ${kp}: ${stats.correct}/${stats.total} (${rate.toFixed(1)}%)\n`;
      });
      prompt += `\n`;
    }

    // 错题分析
    if (reportData.errorAnswers.length > 0) {
      prompt += `## 错题情况\n`;
      prompt += `共 ${reportData.errorAnswers.length} 道错题\n`;
      reportData.errorAnswers.slice(0, 5).forEach((answer: any, index: number) => {
        prompt += `\n错题 ${index + 1}:\n`;
        try {
          const content =
            typeof answer.question.content === 'string'
              ? JSON.parse(answer.question.content)
              : answer.question.content;
          prompt += `题目: ${content.text || content.question || '无'}\n`;
        } catch {
          prompt += `题目: ${answer.question.content}\n`;
        }
        prompt += `学员答案: ${answer.studentAnswer}\n`;
        prompt += `正确答案: ${answer.question.answer}\n`;
        prompt += `知识点: ${answer.question.knowledgePoints.join(', ')}\n`;
      });
      prompt += `\n`;
    }

    // AI 对话摘要
    if (reportData.aiConversations.length > 0) {
      prompt += `## AI 辅导记录\n`;
      prompt += `共进行了 ${reportData.aiConversations.length} 次对话\n`;
      const userMessages = reportData.aiConversations.filter(
        (c: any) => c.role === 'USER'
      ).length;
      prompt += `学员提问次数: ${userMessages}\n\n`;
    }

    // 生成要求
    prompt += `## 报告生成要求\n`;
    prompt += `请生成一份包含以下内容的 JSON 格式报告:\n`;
    prompt += `1. summary: 整体表现总结（100-200字）\n`;
    prompt += `2. abilityAnalysis: 各知识点掌握度评分（0-100分）\n`;
    prompt += `3. errorAnalysis: 错题分析（每道错题的错误原因和改进建议）\n`;
    prompt += `4. learningAdvice: 个性化学习建议（200-300字）\n\n`;

    prompt += `请以 JSON 格式返回，格式如下:\n`;
    prompt += `{\n`;
    prompt += `  "summary": "总结内容",\n`;
    prompt += `  "abilityAnalysis": { "知识点1": 85, "知识点2": 70 },\n`;
    prompt += `  "errorAnalysis": [\n`;
    prompt += `    {\n`;
    prompt += `      "questionId": "题目ID",\n`;
    prompt += `      "reason": "错误原因",\n`;
    prompt += `      "suggestion": "改进建议"\n`;
    prompt += `    }\n`;
    prompt += `  ],\n`;
    prompt += `  "learningAdvice": "学习建议"\n`;
    prompt += `}\n`;

    return prompt;
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(aiResponse: string, reportData: any): ReportContent {
    try {
      // 尝试提取 JSON 内容
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI 响应中未找到 JSON 内容');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 构建完整的报告内容
      const content: ReportContent = {
        summary: parsed.summary || '训练完成',
        abilityAnalysis: parsed.abilityAnalysis || {},
        errorAnalysis: parsed.errorAnalysis || [],
        learningAdvice: parsed.learningAdvice || '继续保持学习',
        statistics: reportData.statistics,
      };

      return content;
    } catch (error) {
      logger.warn('解析 AI 响应失败，使用基础报告:', error);
      return this.generateBasicReport(reportData);
    }
  }

  /**
   * 生成基础报告（AI 失败时的备用方案）
   */
  private generateBasicReport(reportData: any): ReportContent {
    const { statistics, knowledgePointStats, errorAnswers } = reportData;

    // 生成总结
    let summary = `本次训练共完成 ${statistics.totalQuestions} 道题目，`;
    summary += `正确 ${statistics.correctCount} 道，正确率 ${(statistics.correctRate * 100).toFixed(1)}%。`;
    if (statistics.correctRate >= 0.8) {
      summary += `表现优秀，继续保持！`;
    } else if (statistics.correctRate >= 0.6) {
      summary += `表现良好，还有提升空间。`;
    } else {
      summary += `需要加强练习，巩固基础知识。`;
    }

    // 生成能力分析
    const abilityAnalysis: { [key: string]: number } = {};
    knowledgePointStats.forEach((stats: any, kp: string) => {
      abilityAnalysis[kp] = Math.round((stats.correct / stats.total) * 100);
    });

    // 生成错题分析
    const errorAnalysis = errorAnswers.slice(0, 10).map((answer: any) => ({
      questionId: answer.questionId,
      reason: '答案不正确，需要复习相关知识点',
      suggestion: `建议重点复习: ${answer.question.knowledgePoints.join('、')}`,
    }));

    // 生成学习建议
    let learningAdvice = '';
    if (statistics.correctRate >= 0.8) {
      learningAdvice = '整体表现优秀，建议适当提高题目难度，挑战更高水平。';
    } else if (statistics.correctRate >= 0.6) {
      learningAdvice = '基础掌握较好，建议针对薄弱知识点进行专项练习。';
    } else {
      learningAdvice = '基础知识掌握不够扎实，建议系统复习基础内容，多做练习巩固。';
    }

    if (errorAnswers.length > 0) {
      learningAdvice += `特别注意错题本中的 ${errorAnswers.length} 道错题，及时复习攻克。`;
    }

    return {
      summary,
      abilityAnalysis,
      errorAnalysis,
      learningAdvice,
      statistics,
    };
  }

  /**
   * 保存报告到数据库
   */
  private async saveReport(
    sessionId: string,
    studentId: string,
    taskId: string,
    content: ReportContent
  ) {
    try {
      // 检查是否已存在报告
      const existing = await prisma.report.findUnique({
        where: { sessionId },
      });

      if (existing) {
        // 更新现有报告
        return await prisma.report.update({
          where: { id: existing.id },
          data: {
            content: content as any,
            generatedAt: new Date(),
          },
        });
      }

      // 创建新报告
      return await prisma.report.create({
        data: {
          sessionId,
          studentId,
          taskId,
          content: content as any,
        },
      });
    } catch (error: any) {
      logger.error('保存报告失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话科目
   */
  private async getSessionSubject(session: any): Promise<string> {
    try {
      // 从任务配置中获取教材节点
      const config = session.task.config as any;
      const materialNodeIds = config.materialNodeIds || [];

      if (materialNodeIds.length === 0) {
        return '通用';
      }

      // 获取第一个教材节点
      const materialNode = await prisma.materialNode.findUnique({
        where: { id: materialNodeIds[0] },
        include: {
          parent: {
            include: {
              parent: true,
            },
          },
        },
      });

      if (!materialNode) {
        return '通用';
      }

      // 向上查找科目节点
      let current: any = materialNode;
      while (current && current.type !== 'SUBJECT') {
        current = current.parent;
      }

      return current?.name || '通用';
    } catch (error) {
      logger.error('获取会话科目失败:', error);
      return '通用';
    }
  }

  /**
   * 获取阶段文本
   */
  private getPhaseText(phase: string): string {
    const phaseMap: Record<string, string> = {
      PRE_TEST: '训前测试',
      TRAINING: '动态训练',
      FINAL_EXAM: '综合考试',
    };
    return phaseMap[phase] || phase;
  }

  /**
   * 获取报告
   */
  async getReport(reportId: string) {
    try {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          session: {
            include: {
              task: true,
            },
          },
        },
      });

      if (!report) {
        throw new Error('报告不存在');
      }

      return report;
    } catch (error: any) {
      logger.error('获取报告失败:', error);
      throw error;
    }
  }

  /**
   * 获取学员的所有报告
   */
  async getStudentReports(studentId: string, page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where: { studentId },
          include: {
            session: {
              include: {
                task: true,
              },
            },
          },
          orderBy: {
            generatedAt: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.report.count({
          where: { studentId },
        }),
      ]);

      return {
        reports,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error: any) {
      logger.error('获取学员报告列表失败:', error);
      throw error;
    }
  }
}

export const reportGenerationService = new ReportGenerationService();
