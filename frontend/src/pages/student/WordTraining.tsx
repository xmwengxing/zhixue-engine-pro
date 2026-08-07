import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 英语单词训练舱（听写/默写）
 * - 听写：edge-tts 发音（后端代理）逐词播放，Web Speech API 兜底
 * - 默写：按组显示中文释义，学员输入英文
 * - 组间隔倒计时自动进入下一组；完成本轮后强制进入 AI 词汇老师短语填空
 * - 退出/中断保存进度，重新进入可恢复（含未完成填空）
 */

interface WordItem {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  /** CHOICE 选择模式：4 选 1 中文释义选项（后端生成） */
  options?: Array<{ text: string; correct: boolean }>;
}

interface ClozeItem {
  sentence: string;
  answer: string;
  hint?: string;
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
  const [feedback, setFeedback] = useState<{ word: string; correct: boolean } | null>(null);
  const [results, setResults] = useState<Array<{ word: string; correct: boolean; input: string }>>([]);
  const [countingDown, setCountingDown] = useState(0); // 组间隔倒计时
  const [cloze, setCloze] = useState<ClozeItem[]>([]);
  const [clozeIdx, setClozeIdx] = useState(0);
  const [clozeInput, setClozeInput] = useState('');
  const [clozeFeedback, setClozeFeedback] = useState<{ correct: boolean; answer: string } | null>(null);
  const [clozeStats, setClozeStats] = useState({ correct: 0, total: 0 });
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  const submitWord = (choiceText?: string) => {
    // CHOICE 模式：choiceText 为选中释义；其余模式读输入框
    const answer = choiceText !== undefined ? choiceText : input;
    if (!currentWord || !answer.trim()) return;
    // 判分基准：CHOICE 比释义；其余比单词（后端同规则，这里仅本地即时反馈）
    const ref = config?.mode === 'CHOICE' ? currentWord.meaning : currentWord.word;
    const correctLocal = answer.trim().toLowerCase() === ref.trim().toLowerCase();
    setFeedback({ word: currentWord.word, correct: correctLocal });
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
    // 0.8s 后进入下一词
    setTimeout(() => {
      setFeedback(null);
      setInput('');
      if (wordIndex + 1 < group.length) {
        setWordIndex(wordIndex + 1);
      } else {
        // 本组完成 → 进入下一组（组间隔倒计时）
        void submitGroup();
      }
    }, 800);
  };

  const submitGroup = async () => {
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
      // 组间隔倒计时（默认 5s）
      const sec = config?.intervalSec ?? 5;
      setCountingDown(sec);
      const timer = setInterval(() => {
        setCountingDown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      const wait = sec * 1000;
      setTimeout(() => {
        clearInterval(timer);
        setCountingDown(0);
      }, wait);
    } catch (e) {
      setError(getErrorMessage(e, '获取下一组失败'));
    }
  };

  // ===== 短语填空 =====
  const submitCloze = async () => {
    const q = cloze[clozeIdx];
    if (!q || !clozeInput.trim()) return;
    try {
      const res = await request.post('/student/word-task/cloze/check', {
        answer: q.answer,
        input: clozeInput,
      });
      const correct = res.data?.correct === true;
      setClozeFeedback({ correct, answer: q.answer });
      setClozeStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      setTimeout(() => {
        setClozeFeedback(null);
        setClozeInput('');
        if (clozeIdx + 1 < cloze.length) {
          setClozeIdx(clozeIdx + 1);
        } else {
          void finishCloze();
        }
      }, 900);
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
            {q.hint && <p className="text-sm text-[#5b6b8c] mb-4">💡 {q.hint}</p>}
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
              <p
                className={`mt-3 text-sm ${
                  clozeFeedback.correct ? 'text-green-400' : 'text-red-300'
                }`}
              >
                {clozeFeedback.correct ? '✓ 正确！' : `✗ 正确答案：${clozeFeedback.answer}`}
              </p>
            )}
            <button
              onClick={submitCloze}
              disabled={!clozeInput.trim()}
              className="mt-4 w-full py-3 rounded-lg bg-blue-600 text-white disabled:bg-[#324467] disabled:text-[#5b6b8c]"
            >
              {clozeIdx + 1 < cloze.length ? '下一题' : '完成填空'}
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
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={exitSave} className="text-sm text-[#5b6b8c] hover:text-[#c3cfe6]">
            ← 退出（保存进度）
          </button>
          <div className="text-sm text-[#92a4c9]">
            {modeLabel} · 第 {groupIndex + 1}/{totalGroups || 1} 组 ·{' '}
            {wordIndex + 1}/{group.length} 词
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
              /* CHOICE：显示英文单词 + 音标，4 选 1 中文释义 */
              <div className="text-center mb-6">
                <p className="text-xl text-white">{currentWord.word}</p>
                {currentWord.phonetic && (
                  <p className="mt-1 text-[#5b6b8c] text-sm">/ {currentWord.phonetic} /</p>
                )}
                <p className="mt-1 text-[#5b6b8c] text-sm">请选择该单词的正确释义</p>
              </div>
            ) : (
              /* SPELLING：显示中文释义，输入英文 */
              <div className="text-center mb-6">
                <p className="text-xl text-white">{currentWord.meaning}</p>
                {currentWord.phonetic && (
                  <p className="mt-1 text-[#5b6b8c] text-sm">/ {currentWord.phonetic} /</p>
                )}
              </div>
            )}

            {isChoice ? (
              /* CHOICE 选择模式：4 选 1 中文释义 */
              <div className="grid grid-cols-1 gap-3">
                {(currentWord.options || []).map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => submitWord(opt.text)}
                    disabled={!!feedback}
                    className="px-4 py-3 rounded-lg bg-[#1a2332] border border-[#324467] text-white text-left hover:border-blue-500/60 hover:bg-[#232f48] transition-colors disabled:opacity-50"
                  >
                    <span className="mr-2 text-[#5b6b8c]">{'ABCD'[i]}.</span>
                    {opt.text}
                  </button>
                ))}
                {feedback && (
                  <p
                    className={`mt-1 text-center text-lg ${
                      feedback.correct ? 'text-green-400' : 'text-red-300'
                    }`}
                  >
                    {feedback.correct ? '✓ 正确！' : `✗ 正确答案：${currentWord.meaning}`}
                  </p>
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

                {feedback && (
                  <p
                    className={`mt-3 text-center text-lg ${
                      feedback.correct ? 'text-green-400' : 'text-red-300'
                    }`}
                  >
                    {feedback.correct ? '✓ 正确！' : `✗ 正确答案：${feedback.word}`}
                  </p>
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
