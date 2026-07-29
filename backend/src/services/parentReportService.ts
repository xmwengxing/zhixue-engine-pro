import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

const prisma = new PrismaClient();

/**
 * 家长端报告管理服务
 */
export class ParentReportService {
  /**
   * 获取报告列表
   * @param parentId 家长 ID
   * @param filters 筛选条件
   * @returns 报告列表和总数
   */
  async getReports(
    parentId: string,
    filters: {
      studentId?: string;
      /** P3 双轨：报告大类过滤（SUBJECT_MAIN=总任务报告 / SPECIAL=专项报告） */
      category?: 'SUBJECT_MAIN' | 'SPECIAL';
      /** P3 双轨：学科过滤 */
      subject?: string;
      page?: number;
      limit?: number;
    }
  ) {
    try {
      const { studentId, category, subject, page = 1, limit = 10 } = filters;

      // 验证家长是否有权查看该学员的报告
      if (studentId) {
        const relation = await prisma.parentChildRelation.findFirst({
          where: {
            parentId,
            studentId,
            status: 'ACTIVE',
          },
        });

        if (!relation) {
          throw new Error('无权查看该学员的报告');
        }
      }

      // 构建查询条件
      const where: any = {};

      if (studentId) {
        where.studentId = studentId;
      } else {
        // 如果没有指定学员，查询所有绑定学员的报告
        const relations = await prisma.parentChildRelation.findMany({
          where: {
            parentId,
            status: 'ACTIVE',
          },
          select: {
            studentId: true,
          },
        });

        const studentIds = relations.map((r) => r.studentId);
        where.studentId = {
          in: studentIds,
        };
      }

      // P3 双轨：报告大类/学科过滤
      if (category) {
        where.category = category;
      }
      if (subject) {
        where.subject = subject;
      }

      // 计算分页
      const skip = (page - 1) * limit;

      // 并行查询报告列表和总数
      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            generatedAt: 'desc',
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                mode: true,
                status: true,
                category: true,
                subject: true,
                specialType: true,
                createdAt: true,
                completedAt: true,
              },
            },
            session: {
              select: {
                id: true,
                phase: true,
                progress: true,
                status: true,
                startedAt: true,
                completedAt: true,
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
            },
          },
        }),
        prisma.report.count({ where }),
      ]);

      return {
        reports,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('获取报告列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个报告详情
   * @param reportId 报告 ID
   * @param parentId 家长 ID（用于权限验证）
   * @returns 报告详情
   */
  async getReportById(reportId: string, parentId: string) {
    try {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              mode: true,
              config: true,
              status: true,
              createdAt: true,
              completedAt: true,
            },
          },
          session: {
            select: {
              id: true,
              phase: true,
              progress: true,
              status: true,
              startedAt: true,
              completedAt: true,
              currentStep: true,
              totalSteps: true,
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
              answers: {
                include: {
                  question: {
                    select: {
                      id: true,
                      type: true,
                      content: true,
                      answer: true,
                      difficulty: true,
                      knowledgePoints: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!report) {
        throw new Error('报告不存在');
      }

      // 验证权限：检查家长是否有权查看该学员的报告
      const relation = await prisma.parentChildRelation.findFirst({
        where: {
          parentId,
          studentId: report.studentId,
          status: 'ACTIVE',
        },
      });

      if (!relation) {
        throw new Error('无权访问该报告');
      }

      return report;
    } catch (error) {
      logger.error('获取报告详情失败:', error);
      throw error;
    }
  }

  /**
   * 导出报告为 PDF
   * @param reportId 报告 ID
   * @param parentId 家长 ID（用于权限验证）
   * @returns PDF 文件流
   */
  async exportReportToPDF(reportId: string, parentId: string): Promise<Readable> {
    try {
      // 获取报告详情
      const report = await this.getReportById(reportId, parentId);

      // 创建 PDF 文档
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
      });

      // 解析报告内容
      const content = report.content as any;
      const studentName = report.session.student.studentProfile?.realName || report.session.student.username;
      const taskTitle = report.task.title;
      const completedAt = report.session.completedAt
        ? new Date(report.session.completedAt).toLocaleString('zh-CN')
        : '未完成';

      // 添加标题
      doc.fontSize(20).text('智能训练报告', { align: 'center' });
      doc.moveDown();

      // 添加基本信息
      doc.fontSize(12);
      doc.text(`学员姓名: ${studentName}`);
      doc.text(`任务标题: ${taskTitle}`);
      doc.text(`完成时间: ${completedAt}`);
      doc.text(`报告生成时间: ${new Date(report.generatedAt).toLocaleString('zh-CN')}`);
      doc.moveDown();

      // 添加总结
      if (content.summary) {
        doc.fontSize(14).text('学习总结', { underline: true });
        doc.fontSize(11).text(content.summary);
        doc.moveDown();
      }

      // 添加能力分析
      if (content.abilityAnalysis) {
        doc.fontSize(14).text('能力分析', { underline: true });
        doc.fontSize(11);
        
        const abilities = content.abilityAnalysis as Record<string, number>;
        for (const [knowledgePoint, score] of Object.entries(abilities)) {
          doc.text(`${knowledgePoint}: ${(score * 100).toFixed(1)}%`);
        }
        doc.moveDown();
      }

      // 添加错题分析
      if (content.errorAnalysis && Array.isArray(content.errorAnalysis)) {
        doc.fontSize(14).text('错题分析', { underline: true });
        doc.fontSize(11);
        
        content.errorAnalysis.forEach((error: any, index: number) => {
          doc.text(`${index + 1}. 题目 ID: ${error.questionId}`);
          doc.text(`   错误原因: ${error.reason}`);
          doc.text(`   改进建议: ${error.suggestion}`);
          doc.moveDown(0.5);
        });
        doc.moveDown();
      }

      // 添加学习建议
      if (content.learningAdvice) {
        doc.fontSize(14).text('学习建议', { underline: true });
        doc.fontSize(11).text(content.learningAdvice);
        doc.moveDown();
      }

      // 添加页脚
      doc.fontSize(10).text('本报告由智能提分训练平台自动生成', {
        align: 'center',
      });

      // 结束文档
      doc.end();

      logger.info(`报告导出成功: ${reportId}`);

      return doc as unknown as Readable;
    } catch (error) {
      logger.error('导出报告失败:', error);
      throw error;
    }
  }
}

export const parentReportService = new ParentReportService();
