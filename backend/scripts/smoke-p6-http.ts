/**
 * P6 HTTP 级端到端冒烟：
 *  1) admin 登录 → AgentDocument 建/查/改(版本自增)/删
 *  2) parent 登录 → 读学员长期记忆（只读接口）
 * 服务端需在 http://localhost:3000 运行且已配置 ACTIVE 的 AIProvider。
 */
const BASE = process.env.P6_BASE || 'http://localhost:3000';

type Json = any;

async function http(method: string, path: string, token?: string, body?: Json): Promise<{ status: number; data: Json }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Json = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`断言失败: ${msg}`);
  console.log(`  ✅ ${msg}`);
}

async function main() {
  console.log(`\n=== [P6] 管理端登录 ===`);
  const adminLogin = await http('POST', '/api/auth/login', undefined, { username: 'admin', password: 'password123' });
  assert(adminLogin.status === 200 && adminLogin.data?.success, 'admin 登录成功');
  const adminToken = adminLogin.data.data.token as string;
  assert(!!adminToken, '获取到 admin token');

  console.log(`\n=== [P6] 管理端 AgentDocument 建/查/改/删 ===`);
  const createBody = {
    type: 'CONSTRAINT',
    title: 'P6冒烟-全局行为红线(临时)',
    subject: null,
    content: 'P6 自动化冒烟测试写入的约束：不得泄露答案，必须苏格拉底式引导。',
    priority: 5,
    enabled: true,
  };
  const created = await http('POST', '/api/admin/agent-docs', adminToken, createBody);
  assert(created.status === 200 || created.status === 201, `创建文档 HTTP=${created.status}`);
  const docId = created.data?.data?.id as string;
  const v1 = created.data?.data?.version as number;
  assert(!!docId, '创建返回文档 id');
  assert(v1 === 1, `初始版本=1 (实际 ${v1})`);

  // 查询列表应包含该文档
  const list = await http('GET', '/api/admin/agent-docs?type=CONSTRAINT', adminToken);
  assert(list.status === 200, `列表查询 HTTP=${list.status}`);
  const inList = (list.data?.data || []).some((d: Json) => d.id === docId);
  assert(inList, '列表中存在刚创建的文档');

  // 修改内容 → 版本自增为 2
  const updated = await http('PUT', `/api/admin/agent-docs/${docId}`, adminToken, {
    content: 'P6 自动化冒烟测试写入的约束（已修订）：不得泄露答案，必须苏格拉底式引导；修订后版本应自增。',
  });
  assert(updated.status === 200, `更新文档 HTTP=${updated.status}`);
  const v2 = updated.data?.data?.version as number;
  assert(v2 === v1 + 1, `版本自增 ${v1}→${v2}`);

  // 关闭启用开关
  const disabled = await http('PUT', `/api/admin/agent-docs/${docId}`, adminToken, { enabled: false });
  assert(disabled.status === 200 && disabled.data?.data?.enabled === false, '启用开关可关闭');

  // 删除
  const del = await http('DELETE', `/api/admin/agent-docs/${docId}`, adminToken);
  assert(del.status === 200, `删除文档 HTTP=${del.status}`);
  const listAfter = await http('GET', '/api/admin/agent-docs?type=CONSTRAINT', adminToken);
  const gone = !(listAfter.data?.data || []).some((d: Json) => d.id === docId);
  assert(gone, '删除后列表不再包含该文档');

  console.log(`\n=== [P6] 家长端登录 + 只读记忆接口 ===`);
  const parentLogin = await http('POST', '/api/auth/login', undefined, { username: 'parent1', password: 'password123' });
  assert(parentLogin.status === 200 && parentLogin.data?.success, 'parent1 登录成功');
  const parentToken = parentLogin.data.data.token as string;

  const STUDENT_ID = '57f50f80-b31b-4220-af21-286f46320c94';
  const mem = await http('GET', `/api/parent/children/${STUDENT_ID}/memories`, parentToken);
  assert(mem.status === 200 && mem.data?.success, `家长读记忆 HTTP=${mem.status}`);
  assert(Array.isArray(mem.data?.data), '返回记忆数组（无记忆时为空数组也通过）');
  console.log(`   ℹ️ 当前学员记忆条数=${mem.data?.data?.length ?? 0}`);

  console.log('\n🎉 P6 HTTP 冒烟全部通过');
}

main().catch((e) => {
  console.error('\n❌ P6 HTTP 冒烟失败:', e.message);
  process.exit(1);
});
