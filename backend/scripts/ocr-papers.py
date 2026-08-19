#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞桨 PaddleOCR-VL 试卷 OCR 脚本（扫描件文本层提取）
用法：
  python ocr-papers.py --file <pdf> --token <TOKEN> --out <out.txt> [--max-pages N] [--usage <usage.json>] [--limit 20000]
流程：pymupdf 渲染每页 PNG → PaddleOCR-VL job（提交+轮询）→ markdown 文本 → 合并
额度控制：--usage 文件累计页数（默认 20000 页/日）；额度耗尽 → exit 3（调用方停止全量）
退出码：0=成功 1=失败 2=部分成功 3=额度耗尽中断
"""
import argparse
import json
import os
import re
import sys
import time

import fitz  # pymupdf
import requests

JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
MODEL = "PaddleOCR-VL-1.6"


def render_pages(pdf_path, max_pages=None):
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        if max_pages and i >= max_pages:
            break
        pix = page.get_pixmap(dpi=200)
        pages.append(pix.tobytes("png"))
    doc.close()
    return pages


def submit_job(token, png_bytes, page_no):
    files = {"file": (f"p{page_no}.png", png_bytes, "image/png")}
    data = {
        "model": MODEL,
        "optionalPayload": json.dumps({
            "useDocOrientationClassify": False,
            "useDocUnwarping": False,
            "useChartRecognition": False,
        }),
    }
    r = requests.post(JOB_URL, headers={"Authorization": f"bearer {token}"},
                      files=files, data=data, timeout=90)
    if r.status_code in (429, 402, 403):
        raise QuotaError(r.text[:200])
    if not r.ok:
        raise RuntimeError(f"提交失败 {r.status_code}: {r.text[:200]}")
    j = r.json()
    job_id = (j.get("data") or {}).get("jobId")
    if not job_id:
        raise RuntimeError(f"提交失败(无jobId): {str(j)[:200]}")
    return job_id


def poll_job(token, job_id):
    deadline = time.time() + 10 * 60
    while time.time() < deadline:
        r = requests.get(f"{JOB_URL}/{job_id}",
                         headers={"Authorization": f"bearer {token}"}, timeout=60)
        if r.status_code in (429, 402, 403):
            raise QuotaError(r.text[:200])
        if r.ok:
            j = r.json()
            state = (j.get("data") or {}).get("state")
            if state == "done":
                res = (j.get("data") or {}).get("resultUrl") or {}
                return res.get("jsonUrl") or res.get("jsonlUrl") or ""
            if state == "failed":
                raise RuntimeError(f"任务失败: {((j.get('data') or {}).get('errorMsg') or '未知')}")
        time.sleep(5)
    raise RuntimeError("任务超时（10 分钟）")


def fetch_text(jsonl_url):
    r = requests.get(jsonl_url, timeout=120)
    if not r.ok:
        raise RuntimeError(f"结果下载失败 {r.status_code}")
    pages = []
    for line in r.text.splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
            results = obj.get("result", {}).get("layoutParsingResults") or []
            for res in results:
                md = (res.get("markdown") or {}).get("text")
                if md and md.strip():
                    # 去掉 OCR markdown 里的图片/HTML 标签（图片题保留题干文本部分）
                    md = re.sub(r"<[^>]+>", "", md)
                    md = md.strip()
                    if md:
                        pages.append(md)
        except Exception:
            pass
    return "\n\n".join(pages)


class QuotaError(RuntimeError):
    pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--token", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-pages", type=int, default=0)
    ap.add_argument("--usage", default="")
    ap.add_argument("--limit", type=int, default=20000)
    args = ap.parse_args()

    # 额度累计
    used = 0
    if args.usage and os.path.exists(args.usage):
        try:
            used = json.load(open(args.usage, encoding="utf-8")).get("pages", 0)
        except Exception:
            used = 0

    pages = render_pages(args.file, args.max_pages or None)
    if not pages:
        print("NO_PAGES", file=sys.stderr)
        sys.exit(1)

    if used + len(pages) > args.limit:
        print(f"QUOTA_EXCEED used={used} need={len(pages)} limit={args.limit}", file=sys.stderr)
        sys.exit(3)

    texts, failed = [], 0
    for i, png in enumerate(pages):
        try:
            job = submit_job(args.token, png, i + 1)
            url = poll_job(args.token, job)
            t = fetch_text(url) if url else ""
            if t.strip():
                texts.append(t)
            else:
                failed += 1
        except QuotaError as e:
            print(f"QUOTA_EXHAUSTED page={i + 1}: {e}", file=sys.stderr)
            sys.exit(3)
        except Exception as e:
            failed += 1
            print(f"PAGE_FAIL page={i + 1}: {e}", file=sys.stderr)
        time.sleep(1)  # 限速，避免并发触发限流

    # 累计额度
    if args.usage:
        json.dump({"pages": used + len(pages)}, open(args.usage, "w", encoding="utf-8"))

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n\n".join(texts))

    print(f"OCR_OK pages={len(pages)} ok={len(pages) - failed} failed={failed} text_len={sum(len(t) for t in texts)}")
    sys.exit(0 if failed == 0 else 2)


if __name__ == "__main__":
    main()
