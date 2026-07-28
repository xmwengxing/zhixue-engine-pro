// AI 题目生成服务单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiQuestionGeneratorService } from '../../src/services/aiQuestionGeneratorService';
import { aiServiceManager } from '../../src/services/aiServiceManager';

// Mock AI 服务管理器
vi.mock('../../src/services/aiServiceManager', () => ({
  aiServiceManager: {
    callAI: vi.fn(),
  },
}));

describe('AIQuestionGeneratorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateDiagnosticQuestion', () => {
    it('应该成功生成诊断测试题目', async () => {
      // 模拟 AI 响应
      const mockResponse = JSON.stringify({
        stem: '下列哪个选项是正确的？',
        options: ['选项A', '选项B', '选项C', '选项D'],
        correctAnswer: 'A',
        knowledgePoint: '基础知识',
        difficulty: 'easy',
        explanation: '这是详细解析',
      });

      vi.mocked(aiServiceManager.callAI).mockResolvedValue(mockResponse);

      const context = {
        studentProfile: {
          grade: '五年级',
          materialVersion: '人教版',
          learningFoundation: '良好',
        },
        trainingGoal: '掌握基础知识',
        questionNumber: 1,
        totalQuestions: 10,
      };

      const question = await aiQuestionGeneratorService.generateDiagnosticQuestion(context, 1);

      expect(question).toBeDefined();
      expect(question.stem).toBe('下列哪个选项是正确的？');
      expect(question.options).toHaveLength(4);
      expect(question.correctAnswer).toBe('A');
      expect(question.type).toBe('single_choice');
    });

    it('应该在 AI 响应格式错误时抛出异常', async () => {
      vi.mocked(aiServiceManager.callAI).mockResolvedValue('无效的响应');

      const context = {
        studentProfile: {
          grade: '五年级',
          materialVersion: '人教版',
          learningFoundation: '良好',
        },
        trainingGoal: '掌握基础知识',
        questionNumber: 1,
        totalQuestions: 10,
      };

      await expect(
        aiQuestionGeneratorService.generateDiagnosticQuestion(context, 1)
      ).rejects.toThrow('生成诊断测试题目失败');
    });
  });

  describe('evaluateAnswer', () => {
    it('应该成功评估学员答案', async () => {
      const mockResponse = JSON.stringify({
        isCorrect: true,
        feedback: '回答正确！',
        guidance: '',
      });

      vi.mocked(aiServiceManager.callAI).mockResolvedValue(mockResponse);

      const question = {
        stem: '1+1=?',
        options: ['1', '2', '3', '4'],
        correctAnswer: 'B',
        explanation: '1+1等于2',
        knowledgePoint: '加法',
        difficulty: 'easy' as const,
        type: 'single_choice' as const,
      };

      const evaluation = await aiQuestionGeneratorService.evaluateAnswer(
        question,
        'B',
        { grade: '五年级', trainingGoal: '掌握加法' }
      );

      expect(evaluation).toBeDefined();
      expect(evaluation.isCorrect).toBe(true);
      expect(evaluation.correctAnswer).toBe('B');
      expect(evaluation.feedback).toBe('回答正确！');
    });

    it('应该在 AI 服务失败时使用降级方案', async () => {
      vi.mocked(aiServiceManager.callAI).mockRejectedValue(new Error('AI 服务不可用'));

      const question = {
        stem: '1+1=?',
        options: ['1', '2', '3', '4'],
        correctAnswer: 'B',
        explanation: '1+1等于2',
        knowledgePoint: '加法',
        difficulty: 'easy' as const,
        type: 'single_choice' as const,
      };

      const evaluation = await aiQuestionGeneratorService.evaluateAnswer(
        question,
        'B',
        { grade: '五年级', trainingGoal: '掌握加法' }
      );

      expect(evaluation).toBeDefined();
      expect(evaluation.isCorrect).toBe(true);
      expect(evaluation.correctAnswer).toBe('B');
    });
  });

  describe('chatWithAssistant', () => {
    it('应该在考试阶段禁用 AI 助手', async () => {
      const context = {
        phase: 'FINAL_EXAM' as const,
        recentConversations: [],
        progress: 80,
      };

      const response = await aiQuestionGeneratorService.chatWithAssistant(
        '这道题怎么做？',
        context
      );

      expect(response).toContain('综合考试期间 AI 助手功能暂时不可用');
      expect(aiServiceManager.callAI).not.toHaveBeenCalled();
    });

    it('应该在训练阶段正常响应', async () => {
      vi.mocked(aiServiceManager.callAI).mockResolvedValue('让我们一起思考一下这道题...');

      const context = {
        phase: 'GUIDED_TRAINING' as const,
        recentConversations: [],
        progress: 50,
      };

      const response = await aiQuestionGeneratorService.chatWithAssistant(
        '这道题怎么做？',
        context
      );

      expect(response).toBe('让我们一起思考一下这道题...');
      expect(aiServiceManager.callAI).toHaveBeenCalled();
    });
  });
});
