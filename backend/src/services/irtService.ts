/**
 * IRT（项目反应理论）简化自适应难度服务
 *
 * 模型演进：
 * - v1（历史基线）：单参数 Rasch 模型，答对概率 P = 1 / (1 + e^-(theta - b))
 * - v2（本轮增强）：3PL 模型 + 冷启动校准
 *   - 区分度 a（discrimination）：题目区分高低能力者的能力，a 越大区分越强
 *   - 猜测度 c（guessing）：选择题瞎猜命中的概率下限，P = c + (1-c) / (1 + e^{-a(theta - b)})
 *   - 冷启动校准：新学员前若干次作答步长减半 + 能力值锁定在安全区间，
 *     避免偏难起始题连续答错把 theta 直接砸到 -3 以下、此后长期推送低质题
 *
 * 能力值 theta ∈ [-3, 3]，初始由诊断正确率映射。状态持久化在
 * TrainingSession.trainingProgress.irt（JSON），无需数据库迁移。
 */

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

/**
 * 题型（自由字符串，由题库决定实际取值）
 * 常见值：CHOICE / MULTIPLE_CHOICE / JUDGE / FILL / SUBJECTIVE 等
 */
export type QuestionType = string;

export interface IRTState {
  /** 当前能力估计值 */
  theta: number;
  /** 已参与估计的作答次数 */
  attempts: number;
  /** 冷启动校准是否已完成（前 COLD_START_ATTEMPTS 次作答内为 false） */
  calibrated: boolean;
  /** 最近一次推荐难度 */
  lastRecommended: QuestionDifficulty;
  /** 作答轨迹（保留最近 50 条，用于报表/调试） */
  history: Array<{
    difficulty: QuestionDifficulty;
    isCorrect: boolean;
    timeSpent: number;
    thetaAfter: number;
    /** 该题使用的猜测参数 c（用于复盘模型行为） */
    c?: number;
  }>;
}

// 难度 → Rasch 难度参数 b
const DIFFICULTY_PARAM: Record<QuestionDifficulty, number> = {
  easy: -1,
  medium: 0,
  hard: 1,
};

// 难度 → 区分度 a（题目区分度，越高越能区分高低能力者）
const DISCRIMINATION: Record<QuestionDifficulty, number> = {
  easy: 0.9,
  medium: 1.1,
  hard: 1.3,
};

// 题型 → 猜测参数 c（瞎猜命中的概率下限）。键统一大写，查询时忽略大小写。
const GUESSING_BY_TYPE: Record<string, number> = {
  CHOICE: 0.25, // 单选（四选一）
  SINGLE_CHOICE: 0.25,
  MULTIPLE_CHOICE: 0.1, // 多选难蒙
  MULTIPLE: 0.1,
  JUDGE: 0.5, // 判断题 50%
  TRUE_FALSE: 0.5,
  FILL: 0.05, // 填空几乎无法猜
  FILL_IN: 0.05,
  SUBJECTIVE: 0.0, // 主观题无猜测空间
  ESSAY: 0.0,
};

// 难度兜底猜测率（未提供题型时使用，约等于中等选择题）
const GUESSING_BY_DIFFICULTY: Record<QuestionDifficulty, number> = {
  easy: 0.2,
  medium: 0.25,
  hard: 0.25,
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

// 冷启动校准期参数
const COLD_START_ATTEMPTS = 5; // 前 5 次作答视为校准期
const COLD_START_K_SCALE = 0.5; // 校准期内步长减半，抑制早期噪声
const COLD_START_THETA_FLOOR = -1.2; // 校准期内 theta 下限，防止连错暴跌
const COLD_START_THETA_CEIL = 1.2; // 校准期内 theta 上限，防止连蒙暴涨

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
   * 创建初始 IRT 状态（默认未校准）
   */
  createState(diagnosticAccuracy?: number): IRTState {
    const theta = this.initialTheta(diagnosticAccuracy);
    return {
      theta,
      attempts: 0,
      calibrated: false,
      lastRecommended: this.recommendDifficulty(theta),
      history: [],
    };
  }

  /**
   * 3PL 模型答对概率：P = c + (1-c) / (1 + e^{-a(theta - b)})
   * @param questionType 可选，用于更精准地确定猜测参数 c；缺省时按难度取兜底值
   */
  probabilityCorrect(
    theta: number,
    difficulty: QuestionDifficulty,
    questionType?: QuestionType
  ): number {
    const b = DIFFICULTY_PARAM[difficulty] ?? 0;
    const a = DISCRIMINATION[difficulty] ?? 1;
    const c = this.guessingRate(difficulty, questionType);
    return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
  }

  /**
   * 解析猜测参数 c（忽略大小写；未知题型按难度兜底）
   */
  guessingRate(difficulty: QuestionDifficulty, questionType?: QuestionType): number {
    if (questionType) {
      const key = String(questionType).toUpperCase();
      if (key in GUESSING_BY_TYPE) {
        return GUESSING_BY_TYPE[key];
      }
    }
    return GUESSING_BY_DIFFICULTY[difficulty] ?? 0.25;
  }

  /**
   * 解析区分度 a
   */
  discrimination(difficulty: QuestionDifficulty): number {
    return DISCRIMINATION[difficulty] ?? 1;
  }

  /**
   * 是否处于冷启动校准期
   */
  isColdStart(state: IRTState): boolean {
    return state.attempts < COLD_START_ATTEMPTS;
  }

  /**
   * 作答后更新能力估计（返回新状态，不修改入参）
   * @param questionType 可选题型，用于带入猜测参数 c
   */
  update(
    state: IRTState,
    difficulty: QuestionDifficulty,
    isCorrect: boolean,
    timeSpentSeconds: number,
    questionType?: QuestionType
  ): IRTState {
    const c = this.guessingRate(difficulty, questionType);
    const p = this.probabilityCorrect(state.theta, difficulty, questionType);
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
    const coldStart = this.isColdStart(state);
    const coldScale = coldStart ? COLD_START_K_SCALE : 1;
    const k = ((BASE_K / (1 + state.attempts * 0.1)) * timeFactor) * coldScale;

    let theta = state.theta + k * (actual - p);

    // 冷启动校准期：锁定安全区间，避免早期连错/连蒙把 theta 砸穿或顶飞
    if (coldStart) {
      theta = Math.min(COLD_START_THETA_CEIL, Math.max(COLD_START_THETA_FLOOR, theta));
    } else {
      theta = Math.min(THETA_MAX, Math.max(THETA_MIN, theta));
    }
    theta = Math.round(theta * 1000) / 1000;

    const nextRecommended = this.recommendDifficulty(theta);

    // 校准完成判定：跨过冷启动门槛且已在全区间
    const calibrated = !this.isColdStart({ ...state, attempts: state.attempts + 1 });

    const history = [
      ...state.history,
      {
        difficulty,
        isCorrect,
        timeSpent: timeSpentSeconds,
        thetaAfter: theta,
        c,
      },
    ].slice(-MAX_HISTORY);

    return {
      theta,
      attempts: state.attempts + 1,
      calibrated,
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
        calibrated: typeof state.calibrated === 'boolean' ? state.calibrated : state.attempts >= COLD_START_ATTEMPTS,
        lastRecommended:
          state.lastRecommended || this.recommendDifficulty(state.theta),
        history: Array.isArray(state.history) ? state.history : [],
      };
    }
    return this.createState(diagnosticAccuracy);
  }
}

export const irtService = new IRTService();
