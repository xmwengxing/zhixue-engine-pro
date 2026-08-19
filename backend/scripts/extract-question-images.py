#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题级图片提取（方案 A）：pymupdf 按题号块定位 → 渲染「题号→下题号」区域 PNG
用法：
  python extract-question-images.py --progress <progress-full-学科.json> --out <图目录>
  --subjects 数学,物理   # 只处理指定学科（默认全部 ok 产物）
输出：图 PNG 到 <out>/<卷ID>/q<N>.png；每卷生成 <out>/<卷ID>/map.json（题号→图路径）
非白像素占比 < 3% 视为无图（文字题跳过渲染）
"""
import argparse
import json
import os
import re

import fitz  # pymupdf

RE_QUES = re.compile(r"^\s*(\d{1,3})\s*[.．、]")


def is_blank_pixmap(pix):
    """整页/区域渲染后判断是否基本空白（无图，只有少量文字）"""
    samples = pix.samples
    n = pix.n
    w, h = pix.width, pix.height
    step = max(1, (w * h) // 20000)  # 采样约 2 万点
    non_white = 0
    total = 0
    for i in range(0, w * h * n, n * step):
        r, g, b = samples[i], samples[i + 1], samples[i + 2]
        total += 1
        if r < 245 or g < 245 or b < 245:
            non_white += 1
    return non_white / max(total, 1) < 0.03


def extract_for_pdf(pdf_path, vol_id, out_dir, max_pages_hint=0):
    """处理单卷：返回 {题号: {image, blank}}"""
    doc = fitz.open(pdf_path)
    # 1) 收集每页的题号块（bbox + 题号 + 页号）
    qblocks = []  # (page_no, top, qno)
    for pno in range(len(doc)):
        page = doc[pno]
        for blk in page.get_text("blocks"):
            x0, y0, x1, y1, text = blk[0], blk[1], blk[2], blk[3], blk[4]
            m = RE_QUES.match(text)
            if m and len(text.strip()) < 400:
                qblocks.append((pno, y0, int(m.group(1))))
    if not qblocks:
        doc.close()
        return {}
    qblocks.sort(key=lambda t: (t[0], t[1]))
    # 2) 每题渲染「题号块 → 下题号块（或页尾）」区域
    result = {}
    os.makedirs(os.path.join(out_dir, vol_id), exist_ok=True)
    for i, (pno, y0, qno) in enumerate(qblocks):
        page = doc[pno]
        # 找下一题位置：同页的下题 or 下一页开头（跨页图不取）
        next_top = None
        for j in range(i + 1, len(qblocks)):
            if qblocks[j][0] == pno:
                next_top = qblocks[j][1]
                break
            else:
                break
        y_end = next_top if next_top is not None else page.rect.height
        # 区域高度：题号到下题之间（限制最小 40pt / 最大 900pt 防止整页）
        if y_end - y0 < 40:
            y_end = min(y0 + 300, page.rect.height)
        clip = fitz.Rect(0, y0 - 4, page.rect.width, min(y_end, page.rect.height))
        try:
            pix = page.get_pixmap(clip=clip, dpi=150)
        except Exception:
            continue
        if is_blank_pixmap(pix):
            result[qno] = {"blank": True}
            continue
        fname = f"q{qno}.png"
        pix.save(os.path.join(out_dir, vol_id, fname))
        result[qno] = {"image": f"{vol_id}/{fname}", "blank": False}
    doc.close()
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--progress", required=True, help="progress-full-学科.json")
    ap.add_argument("--out", required=True, help="图片输出目录（backend/uploads/questions）")
    ap.add_argument("--subjects", default="", help="逗号分隔学科，默认全部")
    args = ap.parse_args()

    subjects = [s.strip() for s in args.subjects.split(",") if s.strip()]
    os.makedirs(args.out, exist_ok=True)

    total_imgs = 0
    total_vols = 0
    for sub in subjects:
        prog_path = args.progress.replace("SUBJ", sub)
        if not os.path.exists(prog_path):
            print(f"[跳过] 无进度文件: {prog_path}")
            continue
        prog = json.load(open(prog_path, encoding="utf-8"))
        base = r"E:\Projects\题库\试卷与习题"
        vol_imgs = 0
        for rel, rec in prog.items():
            if rec.get("parseStatus") != "ok" or not rec.get("questions"):
                continue
            pdf_path = os.path.join(base, sub, rel)
            if not os.path.exists(pdf_path):
                continue
            vol_id = f"{sub}-{abs(hash(rel)) % 1000000}"
            try:
                m = extract_for_pdf(pdf_path, vol_id, args.out)
            except Exception as e:
                print(f"  [失败] {rel[:40]}: {str(e)[:60]}")
                continue
            imgs = {q: v["image"] for q, v in m.items() if not v.get("blank")}
            if imgs:
                vol_imgs += len(imgs)
                json.dump({"sourceFile": rel, "images": imgs},
                          open(os.path.join(args.out, vol_id, "map.json"), "w", encoding="utf-8"))
                total_vols += 1
        print(f"[{sub}] 完成，共 {vol_imgs} 张题图")
        total_imgs += vol_imgs
    print(f"=== 图片提取完成：{total_vols} 卷 {total_imgs} 张图 ===")


if __name__ == "__main__":
    main()
