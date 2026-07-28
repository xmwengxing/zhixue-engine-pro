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
 * 创建任务请求接口
 */
export interface CreateTaskRequest {
  mode: 'CUSTOM' | 'PROFILE';
  studentId: string;
  customConfig?: CustomConfig;
  profileConfig?: ProfileConfig;
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
      page?: number;
      limit?: number;
    }
  ) {
    try {
      const { studentId, status, page = 1, limit = 10 } = filters;

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

      if (data.mode === 'CUSTOM') {
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

        taskTitle = generatedConfig.title;
        taskConfig = {
          mode: 'PROFILE',
          aiTeacher,
          trainingGoal, // 保存训练目标
          diagnosticQuestionCount: finalDiagnosticQuestionCount, // 保存诊断题目数量
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

      // 创建任务
      const task = await prisma.task.create({
        data: {
          studentId: data.studentId,
          createdBy: parentId,
          title: taskTitle,
          mode: data.mode === 'CUSTOM' ? 'CUSTOM' : 'PROFILE',
          config: {
            ...taskConfig,
            aiInstruction, // 保存组装好的 AI 指令
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
}

export const parentTaskService = new ParentTaskService();
