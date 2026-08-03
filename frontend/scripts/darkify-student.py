# -*- coding: utf-8 -*-
"""
学员端暗色化改造器
把 src/pages/student/** 与 src/components/student/** 下的亮色 Tailwind 类
统一替换为项目硬编码暗色规范，并删除失效的 dark: 变体。

规范：
  页面底 #111722 / 卡片 #232f48 / 输入框·表头 #1a2332 / 边框·hover #324467
  主文字 white / 次要 #92a4c9 / 弱化 #5b6b8c / 强调 #3b82f6

用法: python scripts/darkify-student.py [--write]
"""
import io
import os
import re
import sys

WRITE = '--write' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_DIRS = [
    os.path.join(ROOT, 'src', 'pages', 'student'),
    os.path.join(ROOT, 'src', 'components', 'student'),
]

# 语义色（保留色相，改为暗底半透明）
TINTS = ['blue', 'green', 'emerald', 'red', 'rose', 'amber', 'yellow',
         'orange', 'purple', 'violet', 'indigo', 'pink', 'teal', 'cyan', 'sky', 'lime']

# 先做的整体替换（优先级最高）
PRE = [
    (r'\bmin-h-screen bg-(?:gray|slate)-(?:50|100)\b', 'min-h-screen bg-[#111722]'),
    (r'\bh-screen bg-(?:gray|slate)-(?:50|100)\b', 'h-screen bg-[#111722]'),
    (r'\bbg-(?:gray|slate)-(?:50|100) min-h-screen\b', 'bg-[#111722] min-h-screen'),
]

# 中性色映射
NEUTRAL = [
    (r'\bbg-white\b', 'bg-[#232f48]'),
    (r'\bbg-(?:gray|slate)-50\b', 'bg-[#1a2332]'),
    (r'\bbg-(?:gray|slate)-100\b', 'bg-[#1a2332]'),
    (r'\bbg-(?:gray|slate)-200\b', 'bg-[#324467]'),
    (r'\bbg-(?:gray|slate)-300\b', 'bg-[#324467]'),
    (r'\bbg-(?:gray|slate)-(?:700|800|900)\b', 'bg-[#1a2332]'),

    (r'\btext-(?:gray|slate)-900\b', 'text-white'),
    (r'\btext-black\b', 'text-white'),
    (r'\btext-(?:gray|slate)-800\b', 'text-[#e2e8f5]'),
    (r'\btext-(?:gray|slate)-700\b', 'text-[#c3cfe6]'),
    (r'\btext-(?:gray|slate)-600\b', 'text-[#92a4c9]'),
    (r'\btext-(?:gray|slate)-500\b', 'text-[#5b6b8c]'),
    (r'\btext-(?:gray|slate)-400\b', 'text-[#5b6b8c]'),
    (r'\btext-(?:gray|slate)-300\b', 'text-[#92a4c9]'),

    (r'\bborder-(?:gray|slate)-(?:100|200|300|400)\b', 'border-[#324467]'),
    (r'\bborder-(?:gray|slate)-(?:600|700|800)\b', 'border-[#324467]'),
    (r'\bdivide-(?:gray|slate)-(?:100|200|300)\b', 'divide-[#324467]'),
    (r'\bring-(?:gray|slate)-(?:200|300)\b', 'ring-[#324467]'),
    (r'\bplaceholder-(?:gray|slate)-(?:400|500)\b', 'placeholder-[#5b6b8c]'),

    (r'\bhover:bg-(?:gray|slate)-(?:50|100)\b', 'hover:bg-[#1a2332]'),
    (r'\bhover:bg-(?:gray|slate)-(?:200|300)\b', 'hover:bg-[#324467]'),
    (r'\bhover:bg-white\b', 'hover:bg-[#2a3category]'),  # 占位，下面修正
    (r'\bhover:text-(?:gray|slate)-(?:700|800|900)\b', 'hover:text-white'),
    (r'\bhover:border-(?:gray|slate)-(?:300|400)\b', 'hover:border-[#3b82f6]'),
    (r'\bfocus:border-(?:gray|slate)-\d+\b', 'focus:border-[#3b82f6]'),
]

FIXUP = [(r'bg-\[#2a3category\]', 'bg-[#2b3a58]')]


def build_tint_rules():
    rules = []
    for c in TINTS:
        rules += [
            (r'\bbg-%s-50\b' % c, 'bg-%s-500/10' % c),
            (r'\bbg-%s-100\b' % c, 'bg-%s-500/15' % c),
            (r'\bhover:bg-%s-50\b' % c, 'hover:bg-%s-500/15' % c),
            (r'\bhover:bg-%s-100\b' % c, 'hover:bg-%s-500/20' % c),
            (r'\btext-%s-900\b' % c, 'text-%s-300' % c),
            (r'\btext-%s-800\b' % c, 'text-%s-300' % c),
            (r'\btext-%s-700\b' % c, 'text-%s-300' % c),
            (r'\btext-%s-600\b' % c, 'text-%s-400' % c),
            (r'\bborder-%s-100\b' % c, 'border-%s-500/25' % c),
            (r'\bborder-%s-200\b' % c, 'border-%s-500/30' % c),
            (r'\bborder-%s-300\b' % c, 'border-%s-500/40' % c),
        ]
    return rules


TINT_RULES = build_tint_rules()

DARK_VARIANT = re.compile(r'\s*\bdark:[A-Za-z0-9_\-\[\]#/\.:%]+')


def process(text):
    changed = 0
    # 1) 删除失效的 dark: 变体
    text, n = DARK_VARIANT.subn('', text)
    changed += n
    # 2) 页面根容器
    for pat, rep in PRE:
        text, n = re.subn(pat, rep, text)
        changed += n
    # 3) 中性色
    for pat, rep in NEUTRAL:
        text, n = re.subn(pat, rep, text)
        changed += n
    # 4) 语义色
    for pat, rep in TINT_RULES:
        text, n = re.subn(pat, rep, text)
        changed += n
    # 5) 修正占位
    for pat, rep in FIXUP:
        text = re.sub(pat, rep, text)
    # 6) 清理 className 中连续空格
    text = re.sub(r'className="\s+', 'className="', text)
    text = re.sub(r'\s+"', '"', text) if False else text
    return text, changed


def main():
    total_files = 0
    total_changes = 0
    for d in TARGET_DIRS:
        if not os.path.isdir(d):
            continue
        for root, _dirs, files in os.walk(d):
            if '__tests__' in root:
                continue
            for f in sorted(files):
                if not f.endswith(('.tsx', '.ts')):
                    continue
                fp = os.path.join(root, f)
                src = io.open(fp, encoding='utf-8').read()
                out, n = process(src)
                if n and out != src:
                    total_files += 1
                    total_changes += n
                    rel = os.path.relpath(fp, ROOT)
                    print('  %-60s %3d 处' % (rel, n))
                    if WRITE:
                        io.open(fp, 'w', encoding='utf-8').write(out)
    print('\n%s %d 个文件 / %d 处替换' % ('已写入' if WRITE else '[DRY] 待改', total_files, total_changes))


if __name__ == '__main__':
    main()
