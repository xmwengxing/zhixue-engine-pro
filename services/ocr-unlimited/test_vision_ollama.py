#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 Ollama 模型是否支持视觉输入（方案 C）。
1) 生成一张含中文 + 数学公式的测试图
2) 通过 Ollama 原生 /api/chat 接口发送图片，think:false 关闭思考
3) 打印模型返回的转录文本，并判断是否成功识别
"""
import base64
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_IMG = Path(__file__).parent / "vision_test.png"
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "Qwopus3.5-9B-Coder-MTP-Q4_K_M:latest"


def make_test_image():
    img = Image.new("RGB", (720, 420), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 28)
        small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
    except Exception:
        font = ImageFont.load_DEFAULT()
        small = font
    lines = [
        "智学引擎 题库导入测试",
        "",
        "1. 已知函数 f(x) = x^2 + 2x + 1 , 求 f(3) 的值。",
        "2. 解方程: x^2 + y^2 = 25",
        "3. 一个直角三角形的斜边长为 5 cm。",
        "4. 分数示例: 1/2 + 1/3 = 5/6",
        "",
        "Hello, OCR vision test! 1234567890",
    ]
    y = 20
    for i, ln in enumerate(lines):
        d.text((20, y), ln, fill="black", font=font if i in (0,) else small)
        y += 50
    img.save(OUT_IMG)
    return OUT_IMG


def call_ollama_vision(img_path):
    b64 = base64.b64encode(img_path.read_bytes()).decode()
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": "请识别并完整转录图片中的所有文字与公式，保持原有排版顺序，直接输出文本，不要解释。",
                "images": [b64],
            }
        ],
        "think": False,
        "stream": False,
    }
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            resp = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return f"[HTTP ERROR {e.code}] {e.read().decode()[:500]}"
    except Exception as e:
        return f"[ERROR] {e}"
    msg = resp.get("message", {})
    return msg.get("content", "") or f"[NO CONTENT / raw: {json.dumps(resp)[:500]}]"


if __name__ == "__main__":
    p = make_test_image()
    print(f"[OK] 测试图已生成: {p}")
    print("=" * 60)
    out = call_ollama_vision(p)
    print("模型返回:\n", out)
