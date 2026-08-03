"""
生成一张用于端到端验证的测试图（模拟含公式的扫描题），保存到临时目录。
用法（在已激活的 venv 中）：
    python gen_test_image.py
输出：%TEMP%/test_ocr.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 1600
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

font_path = "C:/Windows/Fonts/msyh.ttc"  # 微软雅黑
try:
    font = ImageFont.truetype(font_path, 44)
except Exception:
    font = ImageFont.load("font.pil")

text = (
    "数学测验（模拟扫描件）\n\n"
    "1. 计算：(-3)^2 + √16 = ?\n\n"
    "2. 解方程：2x + 5 = 13\n\n"
    "3. 已知直角三角形两直角边长为 3 和 4，求斜边长。\n\n"
    "4. 化简：(a + b)^2 - (a - b)^2\n\n"
    "5. 求函数 f(x) = x^2 - 4x + 3 的最小值。"
)

d.multiline_text((50, 50), text, fill="black", font=font, spacing=24)

out = os.path.join(os.environ.get("TEMP", "/tmp"), "test_ocr.png")
img.save(out)
print("saved", out)
