import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 家长端：孩子积分总览（余额 / 流水 / 扣分申诉审核 / 手动调整）
 */
interface Tx {
  id: string;
  amount: number;
  type: string;
  memo: string | null;
  balance: number;
  createdAt: string;
}
interface Appeal {
  id: string;
  txId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export const ParentPointsOverview = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustMemo, setAdjustMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await request.get<{ success: boolean; data: any }>(`/parent/children/${studentId}/points`);
      const d = res.data;
      setBalance(d.balance);
      setTxs(d.transactions || []);
      setAppeals(d.pendingAppeals || []);
    } catch (e) {
      alert(getErrorMessage(e, '加载积分数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 学员名（家长儿童列表）
    (async () => {
      try {
        const kids = await request.get<{ success: boolean; data: any }>('/parent/children');
        const child = kids.data.children?.find((c: any) => c.student.id === studentId);
        setStudentName(child?.student?.studentProfile?.realName || child?.student?.username || '');
      } catch {
        /* 忽略 */
      }
    })();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const adjust = async () => {
    const amt = parseInt(adjustAmount, 10);
    if (!Number.isFinite(amt) || amt === 0) return alert('请输入非 0 的调整分值');
    if (adjustMemo.trim().length < 2) return alert('请填写调整原因（孩子也能看到）');
    setSaving(true);
    try {
      await request.post(`/parent/children/${studentId}/points/adjust`, {
        amount: amt,
        memo: adjustMemo.trim(),
      });
      setAdjustAmount('');
      setAdjustMemo('');
      await load();
    } catch (e) {
      alert(getErrorMessage(e, '调整失败'));
    } finally {
      setSaving(false);
    }
  };

  const reviewAppeal = async (appealId: string, approve: boolean) => {
    try {
      await request.post(`/parent/points/appeals/${appealId}/review`, {
        approve,
        note: approve ? '情况属实，积分已返还' : '申诉不成立',
      });
      await load();
    } catch (e) {
      alert(getErrorMessage(e, '处理失败'));
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[#92a4c9]">加载中...</div>;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-2 mb-6">
        <span className="material-symbols-outlined text-amber-400 text-2xl">military_tech</span>
        <h2 className="text-xl font-bold text-white">
          {studentName || '学员'} · 积分总览
        </h2>
        <span className="text-sm text-[#5b6b8c]">1 积分 = 1 元 · 所有任务可赚积分 · 参与度惩罚（不影响成绩）</span>
      </div>

      {/* 余额卡片 + 手动调整 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 rounded-xl text-white">
          <p className="text-white/80 text-sm">当前积分余额</p>
          <p className="text-4xl font-black mt-1">{balance}</p>
          <p className="text-white/70 text-xs mt-1">≈ ¥{balance} 等值愿望</p>
        </div>
        <div className="md:col-span-2 bg-[#232f48] border border-[#324467] rounded-xl p-6">
          <h3 className="text-white font-medium mb-3">手动调整积分（教学奖励 / 家规奖惩）</h3>
          <div className="flex flex-wrap gap-3">
            <input
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="± 分值（如 5 / -3）"
              className="w-32 px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="text"
              value={adjustMemo}
              onChange={(e) => setAdjustMemo(e.target.value)}
              placeholder="调整原因（孩子可见，如：家务奖励）"
              className="flex-1 min-w-[200px] px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={() => void adjust()}
              disabled={saving}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? '保存中...' : '调整'}
            </button>
          </div>
        </div>
      </div>

      {/* 待审申诉 */}
      {appeals.length > 0 && (
        <div className="bg-[#232f48] border border-[#324467] rounded-xl p-6 mb-6">
          <h3 className="text-white font-medium mb-3">
            扣分申诉（{appeals.length} 条待处理）
          </h3>
          <div className="space-y-3">
            {appeals.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-[#1a2332] border border-[#324467]">
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm text-white">{a.reason}</p>
                  <p className="text-xs text-[#5b6b8c] mt-0.5">
                    提交于 {new Date(a.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void reviewAppeal(a.id, true)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-green-500/15 text-green-300 border border-green-500/40 hover:bg-green-500/25"
                  >
                    通过（返还积分）
                  </button>
                  <button
                    onClick={() => void reviewAppeal(a.id, false)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-300 border border-red-500/40 hover:bg-red-500/20"
                  >
                    驳回
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 积分流水 */}
      <div className="bg-[#232f48] border border-[#324467] rounded-xl p-6">
        <h3 className="text-white font-medium mb-3">积分流水（最近 60 条）</h3>
        {txs.length === 0 ? (
          <p className="text-center text-[#5b6b8c] py-6">暂无积分记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#5b6b8c] border-b border-[#324467]">
                  <th className="py-2 pr-3 font-medium">时间</th>
                  <th className="py-2 pr-3 font-medium">说明</th>
                  <th className="py-2 pr-3 font-medium">变动</th>
                  <th className="py-2 font-medium">余额</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-b border-[#1a2332]">
                    <td className="py-2.5 pr-3 text-[#92a4c9] whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 pr-3 text-white">{t.memo || t.type}</td>
                    <td className={`py-2.5 pr-3 font-bold ${t.amount >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                      {t.amount >= 0 ? '+' : ''}{t.amount}
                    </td>
                    <td className="py-2.5 text-[#92a4c9]">{t.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentPointsOverview;
