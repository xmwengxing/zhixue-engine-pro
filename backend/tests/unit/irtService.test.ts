// IRT 服务单元测试（改善5：3PL 模型 + 冷启动校准）
import { describe, it, expect } from 'vitest';
import { irtService, IRTService } from '../../src/services/irtService';

describe('IRTService - 3PL 模型（猜测参数 c）', () => {
  it('选择题的猜测下限应高于主观题', () => {
    const choiceP = irtService.probabilityCorrect(-3, 'hard', 'CHOICE');
    const subjectiveP = irtService.probabilityCorrect(-3, 'hard', 'SUBJECTIVE');
    // theta=-3 时已几乎没有真实做对可能，概率应逼近猜测参数 c
    expect(choiceP).toBeGreaterThan(subjectiveP);
    expect(choiceP).toBeCloseTo(0.25, 1);
    expect(subjectiveP).toBeCloseTo(0, 1);
  });

  it('题型名称大小写不敏感', () => {
    const upper = irtService.guessingRate('medium', 'CHOICE');
    const lower = irtService.guessingRate('medium', 'choice');
    expect(upper).toBe(lower);
    expect(upper).toBe(0.25);
  });

  it('未提供题型时按难度兜底猜测率', () => {
    const c = irtService.guessingRate('medium');
    expect(c).toBe(0.25);
  });

  it('P(theta) 在任意 theta 下不应低于猜测参数 c（3PL 下界）', () => {
    const c = irtService.guessingRate('hard', 'CHOICE');
    for (const theta of [-3, -1, 0, 1, 3]) {
      const p = irtService.probabilityCorrect(theta, 'hard', 'CHOICE');
      expect(p).toBeGreaterThanOrEqual(c - 1e-9);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('IRTService - 冷启动校准', () => {
  it('新学员前若干次作答不会让 theta 跌破冷启动下限 (-1.2)', () => {
    // 模拟最差情况：连续在 hard 题上答错
    let state = irtService.createState(0); // theta = 0
    expect(state.calibrated).toBe(false);
    for (let i = 0; i < 5; i++) {
      state = irtService.update(state, 'hard', false, 120, 'CHOICE');
      expect(state.theta).toBeGreaterThanOrEqual(-1.21);
    }
    // 跨过冷启动门槛后应标记为已校准
    expect(state.calibrated).toBe(true);
  });

  it('冷启动期步长被减半，连错跌速明显慢于全速期', () => {
    // 冷启动期内连错 hard 题的跌幅
    let cold = irtService.createState(0);
    const startTheta = cold.theta;
    cold = irtService.update(cold, 'hard', false, 120, 'CHOICE');
    const coldDrop = startTheta - cold.theta;

    // 已校准状态（先喂满校准期），再连错
    let warm = irtService.createState(0);
    for (let i = 0; i < 5; i++) warm = irtService.update(warm, 'easy', true, 20, 'SUBJECTIVE');
    const warmStart = warm.theta;
    warm = irtService.update(warm, 'hard', false, 120, 'CHOICE');
    const warmDrop = warmStart - warm.theta;

    // 冷启动期单次跌幅应小于全速期（步长减半 + 区间锁定的双重保护）
    expect(coldDrop).toBeLessThan(warmDrop);
  });

  it('全速期（校准后）仍可正常跌至 -3 下限附近', () => {
    let state = irtService.createState(0);
    // 先校准（连对简单主观题）
    for (let i = 0; i < 5; i++) state = irtService.update(state, 'easy', true, 20, 'SUBJECTIVE');
    // 再持续连错难题
    for (let i = 0; i < 30; i++) state = irtService.update(state, 'hard', false, 120, 'CHOICE');
    expect(state.theta).toBeGreaterThanOrEqual(-3);
    expect(state.theta).toBeLessThanOrEqual(-2.5);
  });

  it('ensureState 对旧版无 calibrated 字段的状态补全为已校准', () => {
    const legacy = { theta: 1.2, attempts: 10, lastRecommended: 'medium' as const, history: [] };
    const restored = irtService.ensureState(legacy);
    expect(restored.calibrated).toBe(true);
  });
});
