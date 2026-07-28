/**
 * IRT（项目反应理论）简化自适应难度服务
 *
 * 采用单参数 Rasch 模型 + ELO 式增量更新：
 * - 学生能力值 theta ∈ [-3, 3]，初始由诊断正确率映射
 * - 题目难度参数 b：easy=-1，medium=0，hard=1
 * - 答对概率 P(correct) = 1 / (1 + e^-(theta - b))
 * - 每次作答后：theta += K * (actual - P)，K 随答题耗时微调
 *   （快速答对说明能力高于预期，加大步长；超时答对减小步长）
 *
 * 状态持久化在 TrainingSession.trainingProgress.irt（JSON），无需数据库迁移。
 */

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface IRTState {
  /** 当前能力估计值 */
  theta: number;
  /** 已参与估计的作答次数 */
  attempts: number;
  /** 最近一次推荐难度 */
  lastRecommended: QuestionDifficulty;
  /** 作答轨迹（保留最近 50 条，用于报表/调试） */
  history: Array<{
    difficulty: QuestionDifficulty;
    isCorrect: boolean;
    timeSpent: number;
    thetaAfter: number;
  }>;
}

// 难度 → Rasch 难度参数 b
const DIFFICULTY_PARAM: Record<QuestionDifficulty, number> = {
  easy: -1,
  medium: 0,
  hard: 1,
};

// 期望答题耗时（秒），用于耗时因子
const EXPECTED_TIME_SECONDS: Record<QuestionDifficulty, number> = {
  easy: 30,
  medium: 60,
  hard: 90,
};

const THETA_MIN = -3;
const THETA_MAX = 3;
const BASE_K = 0.6;
const MAX_HISTORY = 50;

export class IRTService {
  /**
   * 由诊断测试正确率映射初始能力值
   * 0% → -2，50% → 0，100% → +2（线性）
   */
  initialTheta(diagnosticAccuracy?: number): number {
    if (
      diagnosticAccuracy === undefined ||
      diagnosticAccuracy === null ||
      Number.isNaN(diagnosticAccuracy)
    ) {
      return 0;
    }
    const acc = Math.min(1, Math.max(0, diagnosticAccuracy));
    return Math.round((acc - 0.5) * 4 * 100) / 100;
  }

  /**
   * 创建初始 IRT 状态
   */
  createState(diagnosticAccuracy?: number): IRTState {
    const theta = this.initialTheta(diagnosticAccuracy);
    return {
      theta,
      attempts: 0,
      lastRecommended: this.recommendDifficulty(theta),
      history: [],
    };
  }

  /**
   * Rasch 模型答对概率
   */
  probabilityCorrect(theta: number, difficulty: QuestionDifficulty): number {
    const b = DIFFICULTY_PARAM[difficulty] ?? 0;
    return 1 / (1 + Math.exp(-(theta - b)));
  }

  /**
   * 作答后更新能力估计（返回新状态，不修改入参）
   */
  update(
    state: IRTState,
    difficulty: QuestionDifficulty,
    isCorrect: boolean,
    timeSpentSeconds: number
  ): IRTState {
    const p = this.probabilityCorrect(state.theta, difficulty);
    const actual = isCorrect ? 1 : 0;

    // 耗时因子：答得快 → 信号更强（1.2），答得慢 → 信号弱化（0.8）
    const expected = EXPECTED_TIME_SECONDS[difficulty] ?? 60;
    let timeFactor = 1;
    if (timeSpentSeconds > 0) {
      if (timeSpentSeconds < expected * 0.5) {
        timeFactor = 1.2;
      } else if (timeSpentSeconds > expected * 1.5) {
        timeFactor = 0.8;
      }
    }

    // 随作答次数衰减步长，估计逐渐收敛
    const k = (BASE_K / (1 + state.attempts * 0.1)) * timeFactor;

    let theta = state.theta + k * (actual - p);
    theta = Math.min(THETA_MAX, Math.max(THETA_MIN, theta));
    theta = Math.round(theta * 1000) / 1000;

    const nextRecommended = this.recommendDifficulty(theta);

    const history = [
      ...state.history,
      { difficulty, isCorrect, timeSpent: timeSpentSeconds, thetaAfter: theta },
    ].slice(-MAX_HISTORY);

    return {
      theta,
      attempts: state.attempts + 1,
      lastRecommended: nextRecommended,
      history,
    };
  }

  /**
   * 由能力值推荐下一题难度
   * theta < -0.5 → easy；-0.5 ~ 0.7 → medium；> 0.7 → hard
   */
  recommendDifficulty(theta: number): QuestionDifficulty {
    if (theta < -0.5) return 'easy';
    if (theta > 0.7) return 'hard';
    return 'medium';
  }

  /**
   * 从 trainingProgress JSON 中安全读取 IRT 状态（不存在/损坏时重建）
   */
  ensureState(raw: unknown, diagnosticAccuracy?: number): IRTState {
    if (
      raw &&
      typeof raw === 'object' &&
      typeof (raw as IRTState).theta === 'number' &&
      typeof (raw as IRTState).attempts === 'number'
    ) {
      const state = raw as IRTState;
      return {
        theta: state.theta,
        attempts: state.attempts,
        lastRecommended:
          state.lastRecommended || this.recommendDifficulty(state.theta),
        history: Array.isArray(state.history) ? state.history : [],
      };
    }
    return this.createState(diagnosticAccuracy);
  }
}

export const irtService = new IRTService();
