import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 英语单词训练舱（听写/默写/选择）
 * - 听写：edge-tts 发音（后端代理）逐词播放，Web Speech API 兜底
 * - 默写：按组显示中文释义，学员输入英文
 * - 选择：显示英文 + 4 选 1 中文释义
 * - 组间隔倒计时自动进入下一组；完成本轮后强制进入 AI 词汇老师短语填空
 * - 退出/中断保存进度，重新进入可恢复（含未完成填空）
 * - 反馈刺激：答对 🎉 弹跳+上行音；答错 😵💫 摇头+卡片抖动+低频警示音+正确答案脉冲
 */

/** 反馈动画 keyframes（自包含，避免污染全局） */
const FEEDBACK_CSS = `
  @keyframes word-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-7px) rotate(-1deg); }
    40% { transform: translateX(7px) rotate(1deg); }
    60% { transform: translateX(-5px); }
    80% { transform: translateX(5px); }
  }
  @keyframes word-pop {
    0% { transform: scale(0.2) translateY(14px); opacity: 0; }
    55% { transform: scale(1.18) translateY(-4px); opacity: 1; }
    100% { transform: scale(1) translateY(0); opacity: 1; }
  }
  @keyframes word-wiggle {
    0%, 100% { transform: rotate(-10deg) scale(1); }
    50% { transform: rotate(10deg) scale(1.12); }
  }
  @keyframes word-pulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
    50% { transform: scale(1.06); }
    100% { transform: scale(1); box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
  }
  .word-shake { animation: word-shake 0.45s ease-in-out; }
  .word-pop { animation: word-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .word-wiggle { animation: word-wiggle 0.7s ease-in-out infinite; }
  .word-pulse { animation: word-pulse 0.9s ease-out 2; }
`;

interface WordItem {
  id: string;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  /** CHOICE 选择模式：4 选 1 中文释义选项（后端生成） */
  options?: Array<{ text: string; correct: boolean }>;
}

interface ClozeItem {
  sentence: string;
  answer: string;
  hint?: string;
  /** 整句中文释义（提交后展示，作答前不显示） */
  translation?: string;
}

interface WordConfig {
  mode: 'DICTATION' | 'SPELLING' | 'CHOICE';
  stage: string;
  orderMode: string;
  groupSize: number;
  intervalSec: number;
  roundSize: number;
}

type Phase = 'WORD' | 'CLOZE' | 'DONE';

const inputCls =
  'w-full px-4 py-3 border border-[#324467] rounded-lg bg-[#1a2332] text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/60';

export default function WordTraining() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('WORD');
  const [config, setConfig] = useState<WordConfig | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [group, setGroup] = useState<WordItem[]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const [wordIndex, setWordIndex] = useState(0); // 组内第几个词
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ word: string; correct: boolean; answer: string } | null>(null);
  const [results, setResults] = useState<Array<{ word: string; correct: boolean; input: string }>>([]);
  const [countingDown] = useState(0); // 保留：听写 speak 依赖（恒 0，组间隔已移除）
  // 自动跳转定时器（手动「下一个」时需清除，防重复跳转）
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cloze, setCloze] = useState<ClozeItem[]>([]);
  const [clozeIdx, setClozeIdx] = useState(0);
  const [clozeInput, setClozeInput] = useState('');
  const [clozeFeedback, setClozeFeedback] = useState<{ correct: boolean; answer: string; translation?: string } | null>(null);
  const [clozeStats, setClozeStats] = useState({ correct: 0, total: 0 });
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ===== 答题音效（Web Audio 合成，无需音频文件）=====
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playAnswerSound = useCallback((kind: 'correct' | 'wrong') => {
    try {
      if (!audioCtxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      // 答对：上行双音（523→784 正弦，轻快）；答错：低频警示双音（196→155 方波，低沉）
      const freqs = kind === 'correct' ? [523.25, 783.99] : [196.0, 155.56];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'correct' ? 'sine' : 'square';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(kind === 'correct' ? 0.16 : 0.11, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      });
    } catch {
      /* 音效失败不影响答题 */
    }
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);

  // 初始化：恢复进行中会话，否则开始新会话
  // ⚠️ resume 失败（网络抖动）时【不】自动 start——避免 start 覆盖旧会话导致进度丢失
  const init = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resume = await request.post<{ success: boolean; data: any }>(
        `/student/word-task/resume/${taskId}`
      );
      if (resume.data?.sessionId) {
        applyResume(resume.data);
        return;
      }
      const started = await request.post<{ success: boolean; data: any }>(
        `/student/word-task/start/${taskId}`
      );
      const d = started.data;
      setSessionId(d.sessionId);
      setConfig(d.config);
      setGroup(d.group);
      setGroupIndex(0);
      setTotalGroups(d.groups);
      setPhase('WORD');
    } catch (e) {
      setError(getErrorMessage(e, '加载单词训练失败，请重试（进度已保存，不会丢失）'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // 心跳自动存档：刷新/关闭/切后台/组件卸载时自动保存进度（不影响进行中会话）
  const sessionIdRef = useRef('');
  const saveGuard = useRef(false);
  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (sessionId) saveGuard.current = false; // 新会话重置防抖
  }, [sessionId]);
  useEffect(() => {
    const autoSave = () => {
      const sid = sessionIdRef.current;
      if (!sid || saveGuard.current) return;
      saveGuard.current = true; // 防抖：一次会话只自动保存一次
      try {
        void request.post(`/student/word-task/finish/${sid}`, { clozeDone: false });
      } catch {
        /* 心跳失败不影响页面 */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') autoSave();
    };
    const onBeforeUnload = () => autoSave();
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      autoSave(); // 组件卸载（路由切换）也自动保存
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  const applyResume = (d: any) => {
    setSessionId(d.sessionId);
    setConfig(d.config);
    setPhase(d.phase || 'WORD');
    if (d.phase === 'CLOZE' || d.done) {
      setCloze(d.cloze || []);
      setClozeIdx(0);
    } else {
      setGroup(d.group || []);
      setGroupIndex(d.groupIndex || 0);
    }
  };

  // ===== 发音（edge-tts 优先，Web Speech 兜底） =====
  const speak = useCallback(
    async (word: string) => {
      setPlaying(true);
      try {
        const res = await request.post(
          '/student/word-task/tts',
          { word },
          { responseType: 'blob' }
        );
        const blob = res as unknown as Blob;
        if (blob && blob.size > 0) {
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = URL.createObjectURL(blob);
          await audioRef.current.play();
          setPlaying(false);
          return;
        }
        throw new Error('empty');
      } catch {
        // Web Speech 兜底
        try {
          const u = new SpeechSynthesisUtterance(word);
          u.lang = 'en-US';
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
        } catch {
          /* 忽略 */
        }
        setPlaying(false);
      }
    },
    []
  );

  // 当前词
  const currentWord = group[wordIndex];

  // 听写模式自动播放当前词（进入组或切换词时）
  useEffect(() => {
    if (config?.mode === 'DICTATION' && currentWord && phase === 'WORD' && countingDown === 0) {
      void speak(currentWord.word);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.mode, currentWord?.id, phase, countingDown]);

  /** 进入下一词（自动定时 / 「下一个」按钮共用） */
  const goNextWord = () => {
    if (!feedback) return; // 防重复触发
    setFeedback(null);
    setInput('');
    if (wordIndex + 1 < group.length) {
      setWordIndex(wordIndex + 1);
    } else {
      // 本组完成 → 直接拉取下一组（提交后的跳转间隔倒计时已覆盖等待，不再额外等组间隔）
      void fetchNextGroup();
    }
  };

  /** 请求下一组（词尾自动衔接；无间隔等待） */
  const fetchNextGroup = async () => {
    try {
      const res = await request.post(`/student/word-task/group/${sessionId}`, {
        groupIndex,
      });
      const d = res.data;
      if (d.done) {
        // 进入短语填空
        setCloze(d.cloze || []);
        setClozeIdx(0);
        setPhase('CLOZE');
        return;
      }
      setGroup(d.group);
      setGroupIndex(d.groupIndex);
      setWordIndex(0);
      setInput('');
    } catch (e) {
      setError(getErrorMessage(e, '获取下一组失败'));
    }
  };

  const submitWord = (choiceText?: string) => {
    // CHOICE 模式：choiceText 为选中释义；其余模式读输入框
    const answer = choiceText !== undefined ? choiceText : input;
    if (!currentWord || !answer.trim()) return;
    // 判分基准：CHOICE 比释义；其余比单词（后端同规则，这里仅本地即时反馈）
    const ref = config?.mode === 'CHOICE' ? currentWord.meaning : currentWord.word;
    const correctLocal = answer.trim().toLowerCase() === ref.trim().toLowerCase();
    setFeedback({ word: currentWord.word, correct: correctLocal, answer: ref });
    playAnswerSound(correctLocal ? 'correct' : 'wrong');
    setResults((prev) => [...prev, { word: currentWord.word, correct: correctLocal, input: answer }]);
    if (config?.mode === 'DICTATION') speechSynthesis.cancel();
    // 逐词落库（异步，不阻塞答题）：判定 + 错题集 + 进度推进（组中途退出可恢复）
    void request
      .post(`/student/word-task/submit-word/${sessionId}`, {
        wordId: currentWord.id,
        input: answer,
      })
      .catch(() => {
        /* 落库失败不影响本次答题 */
      });
    // 跳转间隔后自动进入下一词（可点「下一个」提前跳转）；间隔读任务配置 3/5/8s
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
    const sec = config ? (Number(config.intervalSec) > 0 ? Number(config.intervalSec) : 3) : 3;
    wordTimerRef.current = setTimeout(goNextWord, sec * 1000);
  };

  // ===== 短语填空 =====
  /** 进入下一道填空（自动定时 / 「下一个」按钮共用） */
  const goNextCloze = () => {
    if (!clozeFeedback) return; // 防重复触发
    setClozeFeedback(null);
    setClozeInput('');
    if (clozeIdx + 1 < cloze.length) {
      setClozeIdx(clozeIdx + 1);
    } else {
      void finishCloze();
    }
  };

  const submitCloze = async () => {
    const q = cloze[clozeIdx];
    if (!q || !clozeInput.trim()) return;
    try {
      const res = await request.post('/student/word-task/cloze/check', {
        answer: q.answer,
        input: clozeInput,
        sessionId,
      });
      const correct = res.data?.correct === true;
      setClozeFeedback({ correct, answer: q.answer, translation: q.translation || '' });
      setClozeStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      // 8s 后自动进入下一题（可点「下一个」提前跳转）
      if (clozeTimerRef.current) clearTimeout(clozeTimerRef.current);
      clozeTimerRef.current = setTimeout(goNextCloze, 8000);
    } catch (e) {
      setError(getErrorMessage(e, '判定失败'));
    }
  };

  const finishCloze = async () => {
    try {
      await request.post(`/student/word-task/finish/${sessionId}`, { clozeDone: true });
      setPhase('DONE');
    } catch {
      setPhase('DONE');
    }
  };

  /** 退出（保存进度，未完成填空下次可恢复） */
  const exitSave = async () => {
    try {
      await request.post(`/student/word-task/finish/${sessionId}`, { clozeDone: false });
    } catch {
      /* 忽略 */
    }
    navigate('/student/tasks');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111722]">
        <div className="text-[#92a4c9]">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111722] p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/student/tasks')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            返回任务中心
          </button>
        </div>
      </div>
    );
  }

  if (!config) return null;

  // ===== 完成页 =====
  if (phase === 'DONE') {
    const wrong = results.filter((r) => !r.correct);
    return (
      <div className="min-h-screen bg-[#111722] py-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-[#232f48] rounded-lg p-8 text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">🎉 本轮单词训练完成</h1>
            <p className="text-[#92a4c9]">
              听写/默写正确率{' '}
              <span className="text-xl font-bold text-blue-400">
                {results.length ? Math.round((results.length - wrong.length) / results.length * 100) : 0}%
              </span>
              （{results.length - wrong.length}/{results.length}）
              {clozeStats.total > 0 && (
                <span className="ml-3">
                  短语填空{' '}
                  <span className="text-emerald-400 font-bold">
                    {clozeStats.correct}/{clozeStats.total}
                  </span>
                </span>
              )}
            </p>
          </div>
          {wrong.length > 0 && (
            <div className="bg-[#232f48] rounded-lg p-6">
              <h3 className="text-white font-medium mb-3">本轮错误单词（将按艾宾浩斯安排复习）</h3>
              <div className="flex flex-wrap gap-2">
                {wrong.map((r) => (
                  <span
                    key={r.word}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm"
                  >
                    {r.word}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/student/tasks')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg"
            >
              返回任务中心
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 短语填空阶段 =====
  if (phase === 'CLOZE') {
    const q = cloze[clozeIdx];
    if (!q) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#111722]">
          <div className="text-center">
            <p className="text-[#92a4c9] mb-4">正在生成短语填空…</p>
            <button
              onClick={exitSave}
              className="px-4 py-2 border border-[#324467] text-[#92a4c9] rounded-lg"
            >
              退出
            </button>
          </div>
        </div>
      );
    }
    const parts = q.sentence.split('____');
    return (
      <div className="min-h-screen bg-[#111722] py-6">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={exitSave} className="text-sm text-[#5b6b8c] hover:text-[#c3cfe6]">
              ← 退出（保存进度）
            </button>
            <div className="text-sm text-[#92a4c9]">
              AI 词汇老师 · 短语填空 {clozeIdx + 1}/{cloze.length}
            </div>
          </div>
          <div className="bg-[#232f48] rounded-lg p-6">
            <div className="mb-2 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-xs inline-block">
              加深记忆 · 不计入题库与错题
            </div>
            <p className="text-lg text-white leading-relaxed mb-4">
              {parts[0]}
              <span className="inline-block min-w-[80px] border-b-2 border-blue-500 mx-1 text-blue-300">
                ____
              </span>
              {parts[1]}
            </p>
            {/* 作答前不显示任何答案/提示，避免提前暴露 */}
            <input
              ref={inputRef}
              value={clozeInput}
              onChange={(e) => setClozeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCloze()}
              placeholder="输入单词"
              className={inputCls}
              autoFocus
            />
            {clozeFeedback && (
              <div
                className={`mt-3 rounded-lg border px-4 py-3 ${
                  clozeFeedback.correct
                    ? 'bg-green-500/10 border-green-500/40 word-pop'
                    : 'bg-red-500/10 border-red-500/40 word-shake'
                }`}
              >
                <p className={`text-sm font-medium ${clozeFeedback.correct ? 'text-green-300' : 'text-red-300'}`}>
                  {clozeFeedback.correct ? '✓ 正确！' : `✗ 正确答案：${clozeFeedback.answer}`}
                </p>
                {clozeFeedback.translation && (
                  <p className="mt-1 text-sm text-[#92a4c9]">
                    <span className="text-[#5b6b8c]">整句释义：</span>
                    {clozeFeedback.translation}
                  </p>
                )}
              </div>
            )}
            {clozeFeedback && (
              <button
                onClick={() => {
                  if (clozeTimerRef.current) clearTimeout(clozeTimerRef.current);
                  goNextCloze();
                }}
                className="mt-3 w-full py-2.5 rounded-lg bg-[#232f48] border border-[#324467] text-white hover:border-blue-500/60 hover:bg-[#232f48]/80 transition-colors"
              >
                下一个 →
              </button>
            )}
            <button
              onClick={submitCloze}
              disabled={!clozeInput.trim() || !!clozeFeedback}
              className="mt-3 w-full py-3 rounded-lg bg-blue-600 text-white disabled:bg-[#324467] disabled:text-[#5b6b8c]"
            >
              {clozeIdx + 1 < cloze.length ? '提交' : '完成填空'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 单词训练阶段 =====
  const isDictation = config.mode === 'DICTATION';
  const isChoice = config.mode === 'CHOICE';
  const modeLabel = isDictation ? '听写' : isChoice ? '选择' : '默写';
  return (
    <div className="min-h-screen bg-[#111722] py-6">
      <style>{FEEDBACK_CSS}</style>
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={exitSave} className="text-sm text-[#5b6b8c] hover:text-[#c3cfe6]">
            ← 退出（保存进度）
          </button>
          <div className="text-sm text-[#92a4c9]">
            {modeLabel} ·{' '}
            {group.length > 1
              ? `第 ${groupIndex + 1}/${totalGroups || 1} 组 · ${wordIndex + 1}/${group.length} 词`
              : `第 ${wordIndex + 1}/${totalGroups || 1} 词`}
          </div>
        </div>

        <div className="w-full h-2 bg-[#324467] rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${((groupIndex * group.length + wordIndex) / Math.max(1, (totalGroups || 1) * group.length)) * 100}%` }}
          />
        </div>

        {countingDown > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-[#1a2332] border border-[#324467] text-center">
            <p className="text-[#92a4c9] text-sm">
              下一组将在 <span className="text-2xl font-bold text-blue-400 mx-1">{countingDown}</span> 秒后开始
            </p>
          </div>
        )}

        {countingDown === 0 && currentWord && (
          <div className="bg-[#232f48] rounded-lg p-6">
            {isDictation ? (
              <div className="text-center mb-6">
                <button
                  onClick={() => void speak(currentWord.word)}
                  className="w-20 h-20 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center mx-auto"
                >
                  <span className="material-symbols-outlined text-4xl">
                    {playing ? 'volume_up' : 'volume_up'}
                  </span>
                </button>
                <p className="mt-3 text-[#5b6b8c] text-sm">点击喇叭重新播放发音</p>
              </div>
            ) : isChoice ? (
              /* CHOICE：显示英文单词 + 音标 + 词性，4 选 1 中文释义 */
              <div className="text-center mb-6">
                <p className="text-xl text-white">
                  {currentWord.word}
                  {currentWord.pos && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/30 align-middle">
                      {currentWord.pos}
                    </span>
                  )}
                </p>
                {currentWord.phonetic && (
                  <p className="mt-1 text-[#5b6b8c] text-sm">/ {currentWord.phonetic} /</p>
                )}
                <p className="mt-1 text-[#5b6b8c] text-sm">请选择该单词的正确释义</p>
              </div>
            ) : (
              /* SPELLING：显示中文释义 + 词性，输入英文 */
              <div className="text-center mb-6">
                <p className="text-xl text-white">
                  {currentWord.meaning}
                  {currentWord.pos && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/30 align-middle">
                      {currentWord.pos}
                    </span>
                  )}
                </p>
                {currentWord.phonetic && (
                  <p className="mt-1 text-[#5b6b8c] text-sm">/ {currentWord.phonetic} /</p>
                )}
              </div>
            )}

            {isChoice ? (
              /* CHOICE 选择模式：4 选 1 中文释义 */
              <div className="grid grid-cols-1 gap-3">
                {(currentWord.options || []).map((opt, i) => {
                  // 反馈期间高亮：正确答案绿色脉冲，选错的选项红色
                  const isCorrectOpt = feedback && !feedback.correct && opt.text === currentWord.meaning;
                  const isWrongPick = feedback && !feedback.correct && opt.text === feedback.answer;
                  return (
                    <button
                      key={i}
                      onClick={() => submitWord(opt.text)}
                      disabled={!!feedback}
                      className={`px-4 py-3 rounded-lg border text-white text-left transition-colors ${
                        isCorrectOpt
                          ? 'bg-green-500/15 border-green-500/60 word-pulse'
                          : isWrongPick
                          ? 'bg-red-500/15 border-red-500/60'
                          : 'bg-[#1a2332] border-[#324467] hover:border-blue-500/60 hover:bg-[#232f48] disabled:opacity-50'
                      }`}
                    >
                      <span className="mr-2 text-[#5b6b8c]">{'ABCD'[i]}.</span>
                      {opt.text}
                      {isCorrectOpt && <span className="ml-2 text-green-400 text-xs">✓ 正确答案</span>}
                      {isWrongPick && <span className="ml-2 text-red-400 text-xs">✗</span>}
                    </button>
                  );
                })}
                {feedback && <FeedbackBanner key={feedback.word + String(feedback.correct)} correct={feedback.correct} answer={feedback.answer} />}
                {feedback && (
                  <button
                    onClick={() => {
                      if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
                      goNextWord();
                    }}
                    className="mt-3 w-full py-2.5 rounded-lg bg-[#232f48] border border-[#324467] text-white hover:border-blue-500/60 hover:bg-[#232f48]/80 transition-colors"
                  >
                    下一个 →
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitWord()}
                  placeholder={isDictation ? '输入你听到的单词' : '输入对应的英文单词'}
                  className={inputCls}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />

                {feedback && <FeedbackBanner key={feedback.word + String(feedback.correct)} correct={feedback.correct} answer={feedback.answer} />}
                {feedback && (
                  <button
                    onClick={() => {
                      if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
                      goNextWord();
                    }}
                    className="mt-3 w-full py-2.5 rounded-lg bg-[#232f48] border border-[#324467] text-white hover:border-blue-500/60 hover:bg-[#232f48]/80 transition-colors"
                  >
                    下一个 →
                  </button>
                )}

                <button
                  onClick={() => submitWord()}
                  disabled={!input.trim()}
                  className="mt-4 w-full py-3 rounded-lg bg-blue-600 text-white disabled:bg-[#324467] disabled:text-[#5b6b8c]"
                >
                  提交
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 答题反馈条：答对 🎉 弹跳；答错 😵💫 摇头+卡片抖动+正确答案红色脉冲 */
const FeedbackBanner = ({ correct, answer }: { correct: boolean; answer: string }) => {
  return (
    <div
      className={`mt-3 rounded-lg border px-4 py-3 text-center ${
        correct
          ? 'bg-green-500/10 border-green-500/40 word-pop'
          : 'bg-red-500/10 border-red-500/40 word-shake'
      }`}
    >
      <div className="text-3xl leading-none mb-1">
        {correct ? (
          <span className="word-pop inline-block">🎉</span>
        ) : (
          <span className="word-wiggle inline-block">😵‍💫</span>
        )}
      </div>
      <p className={`text-base font-medium ${correct ? 'text-green-300' : 'text-red-300'}`}>
        {correct ? '太棒了，答对了！' : '哎呀，答错啦！'}
      </p>
      {!correct && (
        <p className="mt-1.5 text-sm text-[#92a4c9]">
          正确答案：
          <span className="ml-1 px-2 py-0.5 rounded bg-red-500/15 text-red-300 font-bold text-base inline-block word-pulse">
            {answer}
          </span>
        </p>
      )}
    </div>
  );
};
