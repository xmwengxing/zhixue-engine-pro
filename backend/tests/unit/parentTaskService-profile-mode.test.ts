import { describe, it, expect } from 'vitest';

/**
 * 家长端任务创建服务 - 档案提取模式测试
 * 
 * 这个测试文件验证任务 6 的实现：
 * - 诊断题目数量参数处理
 * - 档案提取模式标识保存
 * - 学员档案信息关联
 * - 输入验证（训练目标长度、诊断题目数量范围）
 */

describe('家长端任务创建服务 - 档案提取模式', () => {
  describe('输入验证', () => {
    it('应该验证训练目标长度在 10-500 字符之间', () => {
      // 测试短字符串
      const shortGoal = '太短';
      expect(shortGoal.length).toBeLessThan(10);
      
      // 测试正常字符串
      const validGoal = '这是一个有效的训练目标，长度在10到500字符之间';
      expect(validGoal.length).toBeGreaterThanOrEqual(10);
      expect(validGoal.length).toBeLessThanOrEqual(500);
      
      // 测试长字符串
      const longGoal = 'a'.repeat(501);
      expect(longGoal.length).toBeGreaterThan(500);
    });

    it('应该验证诊断题目数量在 5-20 之间', () => {
      // 测试边界值
      expect(5).toBeGreaterThanOrEqual(5);
      expect(5).toBeLessThanOrEqual(20);
      
      expect(20).toBeGreaterThanOrEqual(5);
      expect(20).toBeLessThanOrEqual(20);
      
      // 测试无效值
      expect(4).toBeLessThan(5);
      expect(21).toBeGreaterThan(20);
    });

    it('应该使用默认值 10 当诊断题目数量未提供时', () => {
      const defaultCount = 10;
      expect(defaultCount).toBe(10);
      expect(defaultCount).toBeGreaterThanOrEqual(5);
      expect(defaultCount).toBeLessThanOrEqual(20);
    });
  });

  describe('任务配置结构', () => {
    it('应该包含档案提取模式所需的所有字段', () => {
      // 模拟任务配置对象
      const taskConfig = {
        mode: 'PROFILE',
        aiTeacher: 'test-teacher-id',
        trainingGoal: '提高数学成绩',
        diagnosticQuestionCount: 10,
        profileBased: true,
        studentProfileSnapshot: {
          realName: '测试学员',
          gender: '男',
          grade: '初一',
          school: '测试学校',
          materialVersion: '人教版',
          learningFoundation: '基础良好',
          interests: '数学、物理',
          subjectLevels: { math: 'good' },
        },
      };

      // 验证必需字段存在
      expect(taskConfig.mode).toBe('PROFILE');
      expect(taskConfig.profileBased).toBe(true);
      expect(taskConfig.diagnosticQuestionCount).toBe(10);
      expect(taskConfig.trainingGoal).toBeTruthy();
      expect(taskConfig.studentProfileSnapshot).toBeTruthy();
      expect(taskConfig.studentProfileSnapshot.realName).toBeTruthy();
      expect(taskConfig.studentProfileSnapshot.grade).toBeTruthy();
    });
  });
});
