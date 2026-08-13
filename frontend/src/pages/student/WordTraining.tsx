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

type Phase = 'MEMORIZE' | 'WORD' | 'CLOZE' | 'DONE';

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
  // ===== 背词模式（先背后练）：每组先逐个展示单词/音标/释义/发音/短语 =====
  const [memIdx, setMemIdx] = useState(0); // 背词当前词
  const [letterCount, setLetterCount] = useState(0); // 打字机已展示字母数
  const [memDone, setMemDone] = useState(false); // 组内全部展示完 → 显示 重背/开始训练
  const [memCloze, setMemCloze] = useState<Array<{ sentence: string; translation?: string; answer?: string }>>([]); // 本组短语（背词按 answer 匹配当前词展示完整句，填空复用）
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ word: string; correct: boolean; answer: string } | null>(null);
  const [results, setResults] = useState<Array<{ word: string; correct: boolean; input: string }>>([]);
  const [countingDown] = useState(0); // 保留：听写 speak 依赖（恒 0，组间隔已移除）
  // 自动跳转定时器（手动「下一个」时需清除，防重复跳转）
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cloze, setCloze] = useState<ClozeItem[]>([]);
  const [clozeIdx, setClozeIdx] = useState(0);
  const [showPhonetic, setShowPhonetic] = useState(true); // 听写音标显示开关（点击可隐藏）
  const [lastGroupIdx, setLastGroupIdx] = useState(0); // 当前填空对应的组索引（多组循环用）
  // ===== 右侧历史明细栏（每组短语完成后展示该组词+填空情况）=====
  const [groupHistory, setGroupHistory] = useState<
    Array<{ groupIndex: number; words: Array<{ word: string; correct: boolean }>; clozeCorrect: number; clozeTotal: number; clozeItems?: Array<{ sentence: string; translation: string; correct: boolean }> }>
  >([]);
  const groupHistoryRef = useRef(groupHistory); // 同步 ref（退出保存/组完成时上报最新值）
  const curGroupWordsRef = useRef<Array<{ word: string; correct: boolean }>>([]); // 当前组已答词（同步 ref）
  const clozeStatsRef = useRef({ correct: 0, total: 0 }); // 填空累计（同步 ref）
  const groupClozeStartRef = useRef({ correct: 0, total: 0 }); // 本组填空开始时的累计（差值=本组）
  const curClozeItemsRef = useRef<Array<{ sentence: string; translation: string; correct: boolean }>>([]); // 本组已答短语题（含中文释义）
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
      setPhase('MEMORIZE'); // 先背后练：新任务先进背词模式
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
    // 恢复已持久化的历史明细（退出保存后再进入不丢失）
    if (Array.isArray(d.historyGroups)) {
      groupHistoryRef.current = d.historyGroups;
      setGroupHistory(d.historyGroups);
    }
    if (d.phase === 'CLOZE' || d.done) {
      setCloze(d.cloze || []);
      setClozeIdx(0);
      setLastGroupIdx(d.clozeGroup ?? 0); // 恢复填空对应的组索引（多组循环 finish 用）
    } else {
      setGroup(d.group || []);
      setGroupIndex(d.groupIndex || 0);
      setPhase('MEMORIZE'); // 恢复会话也先进背词（重背当前组，再从头/断点训练）
    }
  };

  // ===== 发音（edge-tts 优先，Web Speech 兜底） =====
  // 听写：每词念 repeat 遍（默认 3 遍，间隔 0.8s）；切词/提交时中断旧播放
  // 优化：词音频前端缓存（Map<word, blobURL>）——重听/重背/重复词零请求零延迟
  const audioCacheRef = useRef(new Map<string, string>());
  const speak = useCallback(
    async (word: string, repeat = 3) => {
      setPlaying(true);
      // 中断上一词播放（提交跳下一词时上一词可能还在念）
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      speechSynthesis.cancel();
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // 等音频「播放完成」再播下一遍（play() 只在播放开始时 resolve，必须等 onended）
      const playToEnd = (el: HTMLAudioElement) =>
        new Promise<void>((resolve) => {
          el.onended = () => resolve();
          el.onerror = () => resolve();
          void el.play().catch(() => resolve());
        });
      const times = Math.max(1, repeat);
      // 前端缓存命中 → 直接播，零请求零延迟
      let url = audioCacheRef.current.get(word.toLowerCase());
      if (!url) {
        try {
          const res = await request.post('/student/word-task/tts', { word }, { responseType: 'blob' });
          const blob = res as unknown as Blob;
          if (blob && blob.size > 0) {
            url = URL.createObjectURL(blob);
            audioCacheRef.current.set(word.toLowerCase(), url);
          }
        } catch {
          url = undefined;
        }
      }
      if (url) {
        if (!audioRef.current) audioRef.current = new Audio();
        for (let i = 0; i < times; i++) {
          audioRef.current.src = url;
          await playToEnd(audioRef.current);
          if (i < times - 1) await sleep(800); // 遍间间隔 0.8s
        }
        setPlaying(false);
        return;
      }
      // Web Speech 兜底（同样重复，等每句自然播完再播下一句）
      try {
          for (let i = 0; i < times; i++) {
            await new Promise<void>((resolve) => {
              const u = new SpeechSynthesisUtterance(word);
              u.lang = 'en-US';
              u.onend = () => resolve();
              u.onerror = () => resolve();
              speechSynthesis.speak(u);
            });
            if (i < times - 1) await sleep(800);
          }
        } catch {
          /* 忽略 */
        }
        setPlaying(false);
    },
    []
  );

  // 当前词
  const currentWord = group[wordIndex];

  // 听写模式自动播放当前词（进入组或切换词时；每词念 3 遍，间隔 0.8s）
  useEffect(() => {
    if (config?.mode === 'DICTATION' && currentWord && phase === 'WORD' && countingDown === 0) {
      void speak(currentWord.word, 3);
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
  // ⚠️ 闭包陷阱：setTimeout 回调必须用「最新渲染」的 goNextWord，
  // 否则回调里的 feedback 是提交前快照（null），guard 会误拦导致不跳转
  const goNextWordRef = useRef(goNextWord);
  goNextWordRef.current = goNextWord;

  /** 请求下一组（词尾自动衔接）：每组完成 → 进入该组短语填空 */
  const fetchNextGroup = async () => {
    try {
      const res = await request.post(`/student/word-task/group/${sessionId}`, {
        groupIndex,
      });
      const d = res.data;
      if (d.phase === 'CLOZE' || d.done) {
        // 本组学完 → 强制进入该组短语填空（填空基于本组词）；记录本组填空起点（历史明细差值）
        setLastGroupIdx(groupIndex);
        groupClozeStartRef.current = { ...clozeStatsRef.current };
        setCloze(d.cloze || []);
        setClozeIdx(0);
        setPhase('CLOZE');
        return;
      }
      // 兜底：进入下一组单词（先进背词模式）
      setGroup(d.group);
      setGroupIndex(d.groupIndex);
      setWordIndex(0);
      setInput('');
      setMemIdx(0);
      setMemDone(false);
      setMemCloze(d.cloze || []);
      setPhase('MEMORIZE');
    } catch (e) {
      setError(getErrorMessage(e, '获取下一组失败'));
    }
  };

  // ===== 背词模式逻辑（打字机逐字母 + 发音 + 播完 5s 自动下一词 + 短语加载）=====
  const memWord = group[memIdx];
  const memFull = memWord?.word || '';
  // 打字机：词变化时重置，逐字母出现（每 320ms 一个，慢节奏便于记忆）
  useEffect(() => {
    if (phase !== 'MEMORIZE' || !memFull) return;
    setLetterCount(0);
    const iv = setInterval(() => {
      setLetterCount((c) => {
        if (c >= memFull.length) {
          clearInterval(iv);
          return c;
        }
        return c + 1;
      });
    }, 320);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, memIdx, memWord?.id, memFull]);
  // 发音：进入背词词时自动朗读 1 遍，念完单词接着念完整短语（若有）
  useEffect(() => {
    if (phase === 'MEMORIZE' && memWord && !memDone) {
      void (async () => {
        await speak(memWord.word, 1);
        const item = memCloze.find((c) => c.answer === memWord.word);
        if (item?.sentence) {
          const full = item.sentence.replace('____', memWord.word);
          if (full.trim() !== memWord.word.trim()) await speak(full, 1);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, memIdx, memWord?.id, memDone, memCloze.length]);
  // 播完 5 秒后自动进入下一词；组尾 → 显示「重背一遍 / 开始训练」
  useEffect(() => {
    if (phase !== 'MEMORIZE' || !memFull || letterCount < memFull.length || memDone) return;
    const t = setTimeout(() => {
      if (memIdx + 1 < group.length) {
        setMemIdx(memIdx + 1);
      } else {
        setMemDone(true);
      }
    }, 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, memIdx, letterCount, memFull.length, memDone, group.length]);
  // 背词模式：后台预取整组词音频（打字机展示期间备好，到词时零等待）
  useEffect(() => {
    if (phase !== 'MEMORIZE' || group.length === 0) return;
    for (const w of group) {
      if (audioCacheRef.current.has(w.word.toLowerCase())) continue;
      void request
        .post('/student/word-task/tts', { word: w.word }, { responseType: 'blob' })
        .then((res: any) => {
          const blob = res as unknown as Blob;
          if (blob && blob.size > 0 && !audioCacheRef.current.has(w.word.toLowerCase())) {
            audioCacheRef.current.set(w.word.toLowerCase(), URL.createObjectURL(blob));
          }
        })
        .catch(() => {
          /* 预取失败，进词时实时获取/Web Speech 兜底 */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, groupIndex, group.length]);

  // 背词阶段加载本组短语（提前生成；填空复用同一批）
  useEffect(() => {
    if (phase !== 'MEMORIZE' || !sessionId) return;
    let alive = true;
    request
      .post(`/student/word-task/group/${sessionId}`, { groupIndex, preview: true })
      .then((res: any) => {
        if (!alive) return;
        const d = res.data || {};
        if (Array.isArray(d.cloze) && d.cloze.length) {
          setMemCloze(d.cloze.map((c: any) => ({ sentence: c.sentence, translation: c.translation || '', answer: c.answer })));
        }
      })
      .catch(() => {
        /* 短语加载失败不阻塞背词 */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, groupIndex, sessionId]);

  const submitWord = (choiceText?: string) => {
    // CHOICE 模式：choiceText 为选中释义；其余模式读输入框
    const answer = choiceText !== undefined ? choiceText : input;
    if (!currentWord || !answer.trim()) return;
    // 判分基准：CHOICE 比释义；其余比单词（后端同规则，这里仅本地即时反馈）
    const ref = config?.mode === 'CHOICE' ? currentWord.meaning : currentWord.word;
    const correctLocal = answer.trim().toLowerCase() === ref.trim().toLowerCase();
    setFeedback({ word: currentWord.word, correct: correctLocal, answer: ref });
    setInput(''); // 提交即清空输入框：防止再次点击「提交」重启计时器/重复落库
    playAnswerSound(correctLocal ? 'correct' : 'wrong');
    // 当前组已答词计入历史明细（组短语完成后展示）
    curGroupWordsRef.current = [...curGroupWordsRef.current, { word: currentWord.word, correct: correctLocal }];
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
    wordTimerRef.current = setTimeout(() => goNextWordRef.current(), sec * 1000);
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
  // 同 goNextWord：定时器用最新引用，避免旧闭包 guard 误拦
  const goNextClozeRef = useRef(goNextCloze);
  goNextClozeRef.current = goNextCloze;

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
      const nextStats = { correct: clozeStatsRef.current.correct + (correct ? 1 : 0), total: clozeStatsRef.current.total + 1 };
      clozeStatsRef.current = nextStats;
      setClozeStats(nextStats);
      // 本组短语题计入历史明细（含中文释义；组完成后展示）
      curClozeItemsRef.current = [
        ...curClozeItemsRef.current,
        { sentence: q.sentence, translation: q.translation || '', correct },
      ];
      // 8s 后自动进入下一题（可点「下一个」提前跳转）
      if (clozeTimerRef.current) clearTimeout(clozeTimerRef.current);
      clozeTimerRef.current = setTimeout(() => goNextClozeRef.current(), 8000);
    } catch (e) {
      setError(getErrorMessage(e, '判定失败'));
    }
  };

  const finishCloze = async () => {
    try {
      // 本组短语完成 → 计入右侧历史明细（本组词 + 本组短语题含中文释义）
      const words = curGroupWordsRef.current;
      const clozeTotal = clozeStatsRef.current.total - groupClozeStartRef.current.total;
      const clozeCorrect = clozeStatsRef.current.correct - groupClozeStartRef.current.correct;
      const clozeItems = curClozeItemsRef.current;
      if (words.length > 0 || clozeTotal > 0) {
        setGroupHistory((prev) => {
          const next = [...prev, { groupIndex: lastGroupIdx, words, clozeCorrect, clozeTotal, clozeItems }];
          groupHistoryRef.current = next;
          return next;
        });
      }
      curGroupWordsRef.current = [];
      curClozeItemsRef.current = [];
      // 多组模式：本组填空完成 → 还有组则返回下一组继续，否则任务完成
      const res = await request.post(`/student/word-task/finish/${sessionId}`, {
        historyGroups: groupHistoryRef.current,
        clozeDone: true,
        groupIndex: lastGroupIdx,
      });
      const d = res.data;
      if (d?.continueNext) {
        // 进入下一组单词
        setGroup(d.group);
        setGroupIndex(d.groupIndex);
        setWordIndex(0);
        setInput('');
        setPhase('WORD');
        return;
      }
      setPhase('DONE');
    } catch {
      setPhase('DONE');
    }
  };

  /** 退出（保存进度，未完成填空下次可恢复；历史明细持久化） */
  const exitSave = async () => {
    try {
      await request.post(`/student/word-task/finish/${sessionId}`, {
        clozeDone: false,
        historyGroups: groupHistoryRef.current,
      });
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
        <div className="max-w-6xl mx-auto px-4 flex gap-6 items-start">
          <div className="max-w-2xl mx-auto flex-1 min-w-0">
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
        <HistorySidebar groupHistory={groupHistory} />
      </div>
      </div>
    );
  }

  // ===== 背词模式（先背后练）：每组先逐个展示单词/音标/释义/发音/短语 =====
  if (phase === 'MEMORIZE') {
    const memWord = group[memIdx];
    const full = memWord?.word || '';
    const typed = full.slice(0, letterCount); // 打字机已显示部分
    const typingDone = letterCount >= full.length;
    const memPhraseItem = memCloze.find((c) => c.answer === memWord?.word) || memCloze[0];
    const memPhrase = memPhraseItem?.sentence || '';
    const memTranslation = memPhraseItem?.translation || '';

    return (
      <div className="min-h-screen bg-[#111722] py-6">
        <style>{FEEDBACK_CSS}</style>
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={exitSave} className="text-sm text-[#5b6b8c] hover:text-[#c3cfe6]">
              ← 退出（保存进度）
            </button>
            <div className="text-sm text-[#92a4c9]">
              背词模式 · 第 {groupIndex + 1}/{totalGroups || 1} 组 · {memIdx + 1}/{group.length} 词
            </div>
          </div>

          {!memWord ? (
            <div className="text-center py-16 text-[#92a4c9]">加载中…</div>
          ) : (
            <div className="bg-[#232f48] rounded-2xl p-8 text-center">
              {/* 打字机效果：单词逐字母跳动出现 */}
              <p className="text-5xl font-black min-h-[3.5rem] tracking-widest break-all text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-amber-300 to-purple-400 drop-shadow-[0_0_18px_rgba(96,165,250,0.35)]">
                {typed}
                <span className={`inline-block w-[3px] h-10 align-middle bg-primary ml-1 ${typingDone ? 'opacity-0' : 'animate-pulse'}`} />
              </p>
              {memWord.phonetic && (
                <p className="mt-2 text-[#92a4c9] text-base">/ {memWord.phonetic} /</p>
              )}
              <p className="mt-3 text-2xl text-blue-300 font-medium">{memWord.meaning}</p>

              {/* 短语（提前生成，展示完整句 + 中文释义） */}
              {memPhrase && (
                <div className="mt-6 rounded-xl bg-[#1a2332] border border-[#324467] px-5 py-4">
                  <p className="text-lg text-white leading-relaxed">
                    {memPhrase.split('____').map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="px-1 rounded bg-primary/20 text-primary font-bold">{full}</span>
                        )}
                      </span>
                    ))}
                  </p>
                  {memTranslation && <p className="mt-1.5 text-sm text-[#92a4c9]">{memTranslation}</p>}
                </div>
              )}

              <button
                onClick={() => void speak(memWord.word, 1)}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-sm hover:bg-blue-600/30"
              >
                <span className="material-symbols-outlined text-lg">{playing ? 'volume_up' : 'volume_up'}</span>
                重听发音
              </button>

              {/* 组内展示完 → 重背一遍 / 开始训练 */}
              {memDone && (
                <div className="mt-8 flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setMemIdx(0);
                      setMemDone(false);
                      setLetterCount(0);
                    }}
                    className="px-6 py-2.5 rounded-lg border border-[#324467] text-[#92a4c9] hover:text-white"
                  >
                    重背一遍
                  </button>
                  <button
                    onClick={() => {
                      setWordIndex(0);
                      setInput('');
                      setPhase('WORD');
                    }}
                    className="px-8 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-blue-500"
                  >
                    开始训练
                  </button>
                </div>
              )}
              {!memDone && (
                <p className="mt-6 text-xs text-[#5b6b8c]">单词播完 5 秒后自动进入下一个</p>
              )}
            </div>
          )}
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
        <div className="max-w-6xl mx-auto px-4 flex gap-6 items-start">
          <div className="max-w-3xl mx-auto flex-1 min-w-0">
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
          <HistorySidebar groupHistory={groupHistory} />
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
      <div className="max-w-6xl mx-auto px-4 flex gap-6 items-start">
        {/* 左侧：训练区 */}
        <div className="max-w-3xl mx-auto flex-1 min-w-0">
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
                {/* 音标（点击可隐藏/显示） */}
                {currentWord.phonetic && (
                  <button
                    onClick={() => setShowPhonetic((v) => !v)}
                    className="mt-1 text-[#92a4c9] hover:text-white text-sm"
                    title={showPhonetic ? '点击隐藏音标' : '点击显示音标'}
                  >
                    {showPhonetic ? `/ ${currentWord.phonetic} /` : '👁 音标已隐藏（点击显示）'}
                  </button>
                )}
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
                  disabled={!input.trim() || !!feedback}
                  className="mt-4 w-full py-3 rounded-lg bg-blue-600 text-white disabled:bg-[#324467] disabled:text-[#5b6b8c]"
                >
                  {feedback ? '已提交，等待跳转…' : '提交'}
                </button>
              </>
            )}
          </div>
        )}
        </div>
        <HistorySidebar groupHistory={groupHistory} />
      </div>
    </div>
  );
}

/** 右侧历史明细栏：每组短语完成后展示该组词+短语题（含中文释义）；错词/错题红色 */
const HistorySidebar = ({
  groupHistory,
}: {
  groupHistory: Array<{
    groupIndex: number;
    words: Array<{ word: string; correct: boolean }>;
    clozeCorrect: number;
    clozeTotal: number;
    clozeItems?: Array<{ sentence: string; translation: string; correct: boolean }>;
  }>;
}) => (
  <aside className="hidden lg:block w-72 shrink-0">
    <div className="sticky top-6 rounded-lg bg-[#1a2332] border border-[#324467] p-4 max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-[18px] text-[#92a4c9]">history</span>
        <h3 className="text-sm font-medium text-white">历史明细</h3>
      </div>
      {groupHistory.length === 0 ? (
        <p className="text-xs text-[#5b6b8c] leading-relaxed">完成一组短语练习后，该组单词与填空情况会显示在这里</p>
      ) : (
        <div className="space-y-3">
          {groupHistory.map((g) => (
            <div key={g.groupIndex} className="rounded-lg bg-[#232f48] border border-[#324467] p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-white">第 {g.groupIndex + 1} 组</span>
                <span
                  className={`text-xs ${
                    g.clozeTotal > 0 && g.clozeCorrect < g.clozeTotal ? 'text-amber-300' : 'text-emerald-400'
                  }`}
                >
                  短语 {g.clozeCorrect}/{g.clozeTotal}
                </span>
              </div>
              <div className="space-y-0.5">
                {g.words.map((w, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-xs ${
                      w.correct ? 'text-emerald-400' : 'text-red-400 font-medium'
                    }`}
                  >
                    <span className="truncate mr-2">{w.word}</span>
                    <span className="shrink-0">{w.correct ? '✓' : '✗'}</span>
                  </div>
                ))}
                {g.clozeItems && g.clozeItems.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-[#324467] space-y-1">
                    {g.clozeItems.map((c, i) => (
                      <div key={i} className="text-xs leading-snug">
                        <div className={`${c.correct ? 'text-emerald-400' : 'text-red-400 font-medium'}`}>
                          {c.correct ? '✓' : '✗'} {c.sentence.replace('____', '___')}
                        </div>
                        {c.translation && <div className="text-[#5b6b8c] mt-0.5">📖 {c.translation}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </aside>
);

/** 答题反馈条：答对 🎉 弹跳；答错 😵💫 摇头+卡片抖动+正确答案红色脉冲 */
const FeedbackBanner = ({ correct, answer }: { correct: boolean; answer: string }) => {  return (
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
