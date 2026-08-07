import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Empty, Loading } from '../../components/shared';
import request from '../../utils/request';
import { getStudentTasks, type Task } from '../../services/studentTrainingService';
import StudentSpecialTaskModal from '../../components/student/StudentSpecialTaskModal';
import WordTaskCreateModal from '../../components/student/WordTaskCreateModal';

/** P3 双轨：专项类型中文标签 */
const SPECIAL_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元专项',
  KNOWLEDGE_POINT: '知识点专项',
  ERROR_BOOK: '错题本专项',
  PAPER: '题库组卷',
  WORD: '英语单词',
};

/**
 * 任务中心页面（P3 双轨）
 * 学科总任务与专项攻克任务分区展示，互不混合；英语单词独立版块
 */
export const TaskCenter = () => {
  const navigate = useNavigate();
  const [mainTasks, setMainTasks] = useState<Task[]>([]);
  const [specialTasks, setSpecialTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // 主动学习入口：新建专项任务弹窗
  const [createOpen, setCreateOpen] = useState(false);
  // 英语单词：新建任务弹窗 + 单词错题本
  const [wordCreateOpen, setWordCreateOpen] = useState(false);
  const [mistakesOpen, setMistakesOpen] = useState(false);
  const [mistakes, setMistakes] = useState<Array<{ word: string; meaning: string; wrongCount: number; nextReviewAt: string | null }>>([]);
  const [mistakesLoading, setMistakesLoading] = useState(false);
  // 专项任务历史记录（V2）
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsFor, setRecordsFor] = useState<Task | null>(null);
  const [records, setRecords] = useState<Array<{
    id: string;
    specialType: string;
    mode: string;
    total: number;
    correct: number;
    wrong: number;
    clozeTotal: number;
    clozeCorrect: number;
    durationSec: number;
    summary: string | null;
    createdAt: string;
  }>>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  /** 加载专项任务历史记录 */
  const loadRecords = async (task: Task) => {
    setRecordsOpen(true);
    setRecordsFor(task);
    setRecordsLoading(true);
    setRecords([]);
    try {
      const res = await request.get<{ success: boolean; data: { items: typeof records } }>(
        `/student/special-records?taskId=${task.id}&limit=50`
      );
      setRecords(res.data.items || []);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      // 双区并行加载：学科总任务 + 专项攻克任务
      const [mainRes, specialRes] = await Promise.all([
        getStudentTasks({ category: 'SUBJECT_MAIN', limit: 50 }),
        getStudentTasks({ category: 'SPECIAL', limit: 50 }),
      ]);
      setMainTasks(mainRes.tasks || []);
      setSpecialTasks(specialRes.tasks || []);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 进入训练舱 / 电子答题专区（按任务模式分流）
   */
  const handleStartTraining = (taskId: string, mode?: string) => {
    if (mode === 'EXAM_PAPER') {
      navigate(`/student/answer-zone/${taskId}`);
    } else if (mode === 'WORD') {
      navigate(`/student/word-training/${taskId}`);
    } else {
      navigate(`/student/training/${taskId}`);
    }
  };

  /** 加载单词错题本 */
  const loadMistakes = async () => {
    setMistakesOpen(true);
    setMistakesLoading(true);
    setMistakes([]);
    try {
      const { default: request } = await import('../../utils/request');
      const res = await request.get<{ success: boolean; data: any[] }>('/student/word-task/mistakes');
      setMistakes((res.data || []).map((m) => ({
        word: m.word,
        meaning: m.meaning,
        wrongCount: m.wrongCount,
        nextReviewAt: m.nextReviewAt,
      })));
    } catch {
      setMistakes([]);
    } finally {
      setMistakesLoading(false);
    }
  };

  /**
   * 获取任务状态显示
   */
  const getTaskStatus = (task: Task): { text: string; color: string } => {
    switch (task.status) {
      case 'COMPLETED':
        return { text: '已完成', color: 'bg-green-500/15 text-green-400' };
      case 'IN_PROGRESS':
        return { text: '进行中', color: 'bg-blue-500/15 text-blue-400' };
      case 'PENDING':
        return { text: '待开始', color: 'bg-[#1a2332] text-[#92a4c9]' };
      default:
        return { text: '未知', color: 'bg-[#1a2332] text-[#92a4c9]' };
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (time: string) => {
    const date = new Date(time);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * 渲染单个任务卡片（两个分区共用）
   */
  const renderTaskCard = (task: Task, isSpecial: boolean) => {
    const taskStatus = getTaskStatus(task);
    return (
      <Card key={task.id} className="p-6 hover:shadow-lg transition-shadow">
        <div className="flex flex-col h-full">
          {/* 任务标题和状态 */}
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex-1">
              {task.title}
            </h3>
            <Badge className={`ml-2 ${taskStatus.color}`}>{taskStatus.text}</Badge>
          </div>

          {/* 学科 / 类型标签 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {task.subject && (
              <span className="px-2 py-0.5 text-xs rounded bg-blue-500/10 text-blue-300">
                {task.subject}
              </span>
            )}
            {isSpecial ? (
              <span className="px-2 py-0.5 text-xs rounded bg-purple-500/10 text-purple-300">
                {SPECIAL_TYPE_LABELS[task.specialType || ''] || '专项攻克'}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-300">
                学科总任务
              </span>
            )}
          </div>

          {/* 任务信息 */}
          <div className="space-y-2 mb-4 flex-1">
            {task.mode === 'WORD' ? (
              <>
                <div className="flex items-center gap-2 text-sm text-[#92a4c9]">
                  <span className="material-symbols-outlined text-[18px]">record_voice_over</span>
                  <span>
                    {task.config?.mode === 'DICTATION' ? '听写' : '默写'} · 阶段：{task.config?.stage ?? '-'} ·{' '}
                    每组 {task.config?.groupSize ?? '-'} 词 · 间隔 {task.config?.intervalSec ?? '-'}s · 每轮{' '}
                    {task.config?.roundSize ?? '-'} 词
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#92a4c9]">
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                  <span>AI 词汇老师 · 完成后自动出短语填空</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[#92a4c9]">
                <span className="material-symbols-outlined text-[18px]">quiz</span>
                <span>题目数量: {task.config?.questionCount ?? '-'} 题</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-[#92a4c9]">
              <span className="material-symbols-outlined text-[18px]">schedule</span>
              <span>创建时间: {formatTime(task.createdAt)}</span>
            </div>

            {task.creator && (
              <div className="flex items-center gap-2 text-sm text-[#92a4c9]">
                <span className="material-symbols-outlined text-[18px]">person</span>
                <span>创建者: {task.creator.username}</span>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="mt-auto flex flex-col gap-2">
            {isSpecial && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void loadRecords(task)}
              >
                历史记录
              </Button>
            )}
            {task.status === 'COMPLETED' ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleStartTraining(task.id, task.mode)}
              >
                查看详情
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => handleStartTraining(task.id, task.mode)}
              >
                {task.mode === 'EXAM_PAPER'
                  ? '去答题'
                  : task.status === 'IN_PROGRESS'
                  ? '继续训练'
                  : '开始训练'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loading size="lg" />
      </div>
    );
  }

  const allTasks = [...mainTasks, ...specialTasks];

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-primary text-3xl">
            assignment_turned_in
          </span>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">
            任务中心
          </h1>
        </div>
        <p className="text-[#92a4c9]">
          查看和管理你的学习任务
        </p>
      </div>

      {/* 任务统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#92a4c9] text-sm mb-1">
                进行中
              </p>
              <p className="text-2xl font-bold text-white">
                {allTasks.filter(t => t.status === 'IN_PROGRESS').length}
              </p>
            </div>
            <div className="bg-blue-500/15 rounded-full p-3">
              <span className="material-symbols-outlined text-blue-400 text-2xl">
                pending_actions
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#92a4c9] text-sm mb-1">
                已完成
              </p>
              <p className="text-2xl font-bold text-white">
                {allTasks.filter(t => t.status === 'COMPLETED').length}
              </p>
            </div>
            <div className="bg-green-500/15 rounded-full p-3">
              <span className="material-symbols-outlined text-green-400 text-2xl">
                check_circle
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#92a4c9] text-sm mb-1">
                总任务数
              </p>
              <p className="text-2xl font-bold text-white">
                {allTasks.length}
              </p>
            </div>
            <div className="bg-purple-500/15 rounded-full p-3">
              <span className="material-symbols-outlined text-purple-400 text-2xl">
                assignment
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* 学科总任务区 */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-emerald-400 text-2xl">school</span>
          <h2 className="text-xl font-bold text-white">学科总任务</h2>
          <span className="text-sm text-[#5b6b8c]">
            （长期主线，计入学情分析）
          </span>
        </div>

        {mainTasks.length === 0 ? (
          <Empty description="暂无学科总任务" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mainTasks.map((task) => renderTaskCard(task, false))}
          </div>
        )}
      </div>

      {/* 专项攻克任务区 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-purple-400 text-2xl">target</span>
          <h2 className="text-xl font-bold text-white">专项攻克任务</h2>
          <span className="text-sm text-[#5b6b8c]">
            （单元 / 知识点 / 错题本 / 组卷短期专项）
          </span>
          <div className="flex-1" />
          {/* 主动学习入口：与家长端一致的专项创建 */}
          <Button
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="border-purple-500/60 text-purple-300 hover:bg-purple-500/10"
          >
            ＋ 新建任务
          </Button>
        </div>

        {/* 专项攻克任务区：排除单词任务（单词任务在下方独立版块展示） */}
        {specialTasks.filter((t) => t.mode !== 'WORD').length === 0 ? (
          <Empty description="暂无专项攻克任务，点击右上角「新建任务」主动发起" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {specialTasks.filter((t) => t.mode !== 'WORD').map((task) => renderTaskCard(task, true))}
          </div>
        )}
      </div>

      {/* 英语单词独立版块 */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-amber-400 text-2xl">translate</span>
          <h2 className="text-xl font-bold text-white">英语单词</h2>
          <span className="text-sm text-[#5b6b8c]">
            （听写 / 默写 · AI 词汇老师短语填空 · 艾宾浩斯复习）
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={() => void loadMistakes()}
            className="border-amber-500/60 text-amber-300 hover:bg-amber-500/10 mr-2"
          >
            单词错题本
          </Button>
          <Button
            variant="outline"
            onClick={() => setWordCreateOpen(true)}
            className="border-amber-500/60 text-amber-300 hover:bg-amber-500/10"
          >
            ＋ 新建单词任务
          </Button>
        </div>

        {specialTasks.filter((t) => t.mode === 'WORD').length === 0 ? (
          <Empty description="暂无单词任务，点击「新建单词任务」开始听写/默写" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {specialTasks.filter((t) => t.mode === 'WORD').map((task) => renderTaskCard(task, true))}
          </div>
        )}
      </div>

      {/* 主动学习入口：新建专项任务弹窗 */}
      <StudentSpecialTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void loadTasks();
        }}
      />

      {/* 英语单词：新建任务弹窗 */}
      <WordTaskCreateModal
        open={wordCreateOpen}
        onClose={() => setWordCreateOpen(false)}
        onCreated={() => {
          setWordCreateOpen(false);
          void loadTasks();
        }}
      />

      {/* 单词错题本弹窗 */}
      {mistakesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMistakesOpen(false)}>
          <div
            className="max-w-xl w-full bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-h-[70vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[#324467]">
              <div>
                <h3 className="text-lg font-medium text-white">单词错题本</h3>
                <p className="text-sm text-[#5b6b8c] mt-0.5">按错误频率排序，答错的词将按艾宾浩斯安排复习</p>
              </div>
              <button onClick={() => setMistakesOpen(false)} className="text-[#5b6b8c] hover:text-white text-xl leading-none">
                ×
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {mistakesLoading ? (
                <p className="text-center text-[#5b6b8c] py-8">加载中...</p>
              ) : mistakes.length === 0 ? (
                <p className="text-center text-[#5b6b8c] py-8">暂无单词错题记录，继续加油！</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[#5b6b8c] border-b border-[#324467]">
                      <th className="py-2 pr-3 font-medium">单词</th>
                      <th className="py-2 pr-3 font-medium">释义</th>
                      <th className="py-2 pr-3 font-medium">错误次数</th>
                      <th className="py-2 font-medium">下次复习</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mistakes.map((m) => (
                      <tr key={m.word} className="border-b border-[#1a2332]">
                        <td className="py-2.5 pr-3 text-white font-medium">{m.word}</td>
                        <td className="py-2.5 pr-3 text-[#92a4c9]">{m.meaning}</td>
                        <td className="py-2.5 pr-3 text-red-300">{m.wrongCount} 次</td>
                        <td className="py-2.5 text-[#5b6b8c]">
                          {m.nextReviewAt ? new Date(m.nextReviewAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 专项任务历史记录弹窗（V2） */}
      {recordsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRecordsOpen(false)}>
          <div className="max-w-2xl w-full bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#324467]">
              <div>
                <h3 className="text-lg font-medium text-white">训练历史记录</h3>
                <p className="text-xs text-[#5b6b8c] mt-0.5">{recordsFor?.title}</p>
              </div>
              <button onClick={() => setRecordsOpen(false)} className="text-[#5b6b8c] hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              {recordsLoading ? (
                <p className="text-sm text-[#5b6b8c] text-center py-8">加载中…</p>
              ) : records.length === 0 ? (
                <p className="text-sm text-[#5b6b8c] text-center py-8">暂无训练记录（完成一轮训练后生成）</p>
              ) : (
                <div className="space-y-2">
                  {records.map((r) => (
                    <div key={r.id} className="rounded-lg bg-[#1a2332] border border-[#324467] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white font-medium">{r.summary || `${r.specialType} 训练`}</span>
                        <span className="text-xs text-[#5b6b8c]">
                          {new Date(r.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[#92a4c9]">
                        <span>模式：{r.mode === 'EXAM_PAPER' ? '整卷' : r.mode === 'DICTATION' ? '听写' : r.mode === 'SPELLING' ? '默写' : r.mode === 'CHOICE' ? '选择' : r.mode}</span>
                        <span>题/词：{r.total}</span>
                        <span className="text-green-400">对 {r.correct}</span>
                        {r.wrong > 0 && <span className="text-red-300">错 {r.wrong}</span>}
                        {r.clozeTotal > 0 && <span>填空 {r.clozeCorrect}/{r.clozeTotal}</span>}
                        <span>耗时 {Math.floor(r.durationSec / 60)}分{r.durationSec % 60}秒</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCenter;
