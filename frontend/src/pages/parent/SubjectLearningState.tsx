import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import request, { type ApiResponse } from '../../utils/request';
import SubjectLearningStateView from '../../components/common/SubjectLearningStateView';

interface Child {
  relationId: string;
  student: { id: string; username: string; profile?: { realName?: string; grade?: string } | null };
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
 * 家长端 - 学科学情档案
 * 先选学员，再查看其各学科档案（共用 SubjectLearningStateView）
 * 下方附「AI 长期记忆」只读卡片（学员不可见，仅家长可读）
 */
export default function SubjectLearningState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string>(() => searchParams.get('studentId') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    request
      .get('/parent/children')
      .then((res: any) => {
        if (!alive) return;
        // 后端返回结构：{ success, data: { children: [...] } }
        const list: Child[] = res?.data?.children ?? [];
        setChildren(list);
        setSelectedId((prev) => {
          if (prev && list.some((c) => c.student.id === prev)) return prev;
          return list[0]?.student.id || '';
        });
      })
      .catch(() => {
        if (alive) setChildren([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleChange = (id: string) => {
    setSelectedId(id);
    setSearchParams(id ? { studentId: id } : {});
  };

  return (
    <div className="min-h-full bg-[#111722]">
      <div className="px-6 pt-6">
        <h1 className="text-2xl font-bold text-white">学科档案</h1>
        <p className="mt-1 text-sm text-[#92a4c9]">
          按学科查看知识点掌握度、薄弱项与训练轨迹
        </p>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-[#92a4c9]">学员：</span>
          <select
            value={selectedId}
            onChange={(e) => handleChange(e.target.value)}
            disabled={children.length === 0}
            className="rounded-lg border border-[#324467] bg-[#1a2332] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {children.length === 0 && <option value="">暂无学员</option>}
            {children.map((c) => (
              <option key={c.student.id} value={c.student.id}>
                {c.student.profile?.realName || c.student.username}
                {c.student.profile?.grade ? `（${c.student.profile.grade}）` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#92a4c9]">加载中...</div>
      ) : selectedId ? (
        <>
          <SubjectLearningStateView studentId={selectedId} role="parent" hideHeader />
          <StudentMemoryCard studentId={selectedId} />
        </>
      ) : (
        <div className="py-16 text-center text-[#5b6b8c]">
          请先在「亲子管理」中绑定学员
        </div>
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
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-blue-400">psychology</span>
        <h2 className="text-lg font-bold text-white">AI 长期记忆</h2>
        <span className="rounded border border-[#324467] px-1.5 py-0.5 text-[11px] text-[#92a4c9]">
          仅家长可见 · 学员不可见
        </span>
      </div>

      {loading ? (
        <div className="py-4 text-sm text-[#5b6b8c]">加载中...</div>
      ) : memories.length === 0 ? (
        <div className="py-4 text-sm text-[#5b6b8c]">
          该学员暂无 AI 记忆记录（AI 会在每次训练会话结束后自动归纳）。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {memories.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-[#324467] bg-[#232f48] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-bold text-blue-400">{m.subject ?? '通用记忆'}</span>
                <span className="rounded border border-[#324467] px-1.5 py-0.5 text-[11px] text-[#5b6b8c]">
                  v{m.version}
                </span>
                <span className="ml-auto text-[11px] text-[#5b6b8c]">
                  {new Date(m.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c7d3ea]">
                {m.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
