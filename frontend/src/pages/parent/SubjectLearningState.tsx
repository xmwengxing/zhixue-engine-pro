import { useState, useEffect } from 'react';
import request, { type ApiResponse } from '../../utils/request';
import SubjectLearningStateView from '../../components/common/SubjectLearningStateView';

interface Child {
  relationId: string;
  student: { id: string; username: string; profile?: { realName?: string } | null };
}

interface StudentMemory {
  id: string;
  studentId: string;
  subject: string | null;
  content: string;
  version: number;
  updatedAt: string;
}

/**
 * 家长端 - 学科学情总览
 * 先选学员，再查看其各学科档案（共用 SubjectLearningStateView）
 * 下方附「AI 长期记忆」只读卡片（学员不可见，仅家长可读）
 */
export default function SubjectLearningState() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    request
      .get('/parent/children')
      .then((res: any) => {
        const list: Child[] = res?.data ?? [];
        setChildren(list);
        if (list.length > 0) setSelectedId(list[0].student.id);
      })
      .catch(() => setChildren([]));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 px-6 pt-6">
        <span className="text-sm text-slate-500 dark:text-slate-400">学员：</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm"
        >
          {children.map((c) => (
            <option key={c.student.id} value={c.student.id}>
              {c.student.profile?.realName || c.student.username}
            </option>
          ))}
        </select>
      </div>
      {selectedId ? (
        <>
          <SubjectLearningStateView studentId={selectedId} role="parent" />
          <StudentMemoryCard studentId={selectedId} />
        </>
      ) : (
        <div className="text-slate-400 py-10 text-center">请先在「学员管理」绑定学员</div>
      )}
    </div>
  );
}

/**
 * 家长端只读：AI 长期记忆卡片
 * 数据来源：GET /parent/children/:studentId/memories
 */
function StudentMemoryCard({ studentId }: { studentId: string }) {
  const [memories, setMemories] = useState<StudentMemory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    request
      .get<ApiResponse<StudentMemory[]>>(`/parent/children/${studentId}/memories`)
      .then((res: any) => {
        if (alive && res?.success) setMemories(res.data ?? []);
      })
      .catch(() => {
        if (alive) setMemories([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [studentId]);

  return (
    <div className="px-6 pb-10">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">psychology</span>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold">AI 长期记忆</h2>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
          仅家长可见 · 学员不可见
        </span>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-4">加载中...</div>
      ) : memories.length === 0 ? (
        <div className="text-slate-400 text-sm py-4">
          该学员暂无 AI 记忆记录（AI 会在每次训练会话结束后自动归纳）。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {memories.map((m) => (
            <div
              key={m.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  {m.subject ?? '通用记忆'}
                </span>
                <span className="text-[11px] text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                  v{m.version}
                </span>
                <span className="text-[11px] text-slate-400 ml-auto">
                  {new Date(m.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                {m.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
