import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';

/** 家长端积分管理：先选择孩子 */
export const PointsChildSelect = () => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await request.get<{ success: boolean; data: any }>('/parent/children');
        setChildren(res.data.children || []);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-[#92a4c9]">加载中...</div>;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-2 mb-6">
        <span className="material-symbols-outlined text-amber-400 text-2xl">military_tech</span>
        <h2 className="text-xl font-bold text-white">积分管理</h2>
        <span className="text-sm text-[#5b6b8c]">选择孩子查看积分流水 / 处理扣分申诉 / 手动调整</span>
      </div>
      {children.length === 0 ? (
        <p className="text-[#5b6b8c]">暂未绑定孩子，请先在「亲子管理」中添加。</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((c) => {
            const s = c.student;
            return (
              <button
                key={c.relationId || s.id}
                onClick={() => navigate(`/parent/points/${s.id}`)}
                className="p-6 bg-[#232f48] border border-[#324467] rounded-xl text-left hover:border-amber-500/60 hover:bg-[#2a3a5c] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                  <div>
                    <div className="text-white font-medium">
                      {s.studentProfile?.realName || s.username}
                    </div>
                    <div className="text-xs text-[#5b6b8c]">{s.username}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-[#92a4c9]">查看积分流水与申诉 →</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PointsChildSelect;
