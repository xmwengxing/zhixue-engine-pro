// AI 返回 JSON 安全解析工具
// 目标：防御 Prompt Injection 导致的 AI 返回结构破坏 / 数据污染 / 运行时崩溃
//  - extractJson: 稳健地从 AI 响应中提取 JSON（兼容 ```json 代码块，括号平衡匹配避免贪婪正则跨对象抓取）
//  - parseAIJson: 用 zod schema 严格校验结构，不抛异常，返回结构化结果供上层重试或回传错误
//  - safeJsonParse: 通用安全解析（无 schema），用于解析自身持久化的数据

import { ZodType } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 从 AI 原始响应中提取 JSON 文本
 */
export function extractJson(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();

  // 1) 优先匹配 ```json / ``` 代码块（中间允许 ```json 或裸 ```）
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) return inner;
  }

  // 2) 括号平衡匹配：从第一个 { 或 [ 出发，找到对应的闭合括号
  const openIdx = text.split('').findIndex((c) => c === '{' || c === '[');
  if (openIdx === -1) return null;
  const closeIdx = matchBracket(text, openIdx);
  if (closeIdx === -1) return null;
  return text.slice(openIdx, closeIdx + 1);
}

/**
 * 括号平衡匹配（尊重字符串与转义），返回闭合括号索引
 */
function matchBracket(s: string, openIdx: number): number {
  const openCh = s[openIdx];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 用 zod schema 安全解析并校验 AI 返回的 JSON。
 * 不抛异常；校验失败返回结构化错误，便于上层决定重试或回传 SSE error 事件。
 */
export function parseAIJson<T>(raw: string, schema: ZodType<T>): ParseResult<T> {
  const json = extractJson(raw);
  if (!json) return { ok: false, error: 'AI 响应中未找到 JSON 内容' };

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}` };
  }

  const result = schema.safeParse(obj);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(根)'}：${i.message}`)
      .join('；');
    return { ok: false, error: `AI 返回结构校验失败：${detail}` };
  }
  return { ok: true, data: result.data };
}

/**
 * 通用安全 JSON 解析（无 schema），用于解析自身持久化的数据（如题目 content）。
 * 失败时返回 null，调用方兜底。
 */
export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
