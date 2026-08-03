@echo off
REM 完整安装并下载模型（在 venv 已存在后运行）
REM 步骤：modelscope → CUDA 版 torch → 其余依赖 → 下载 Unlimited-OCR 权重
cd /d %~dp0
call .venv\Scripts\activate

pip install -q -U pip
pip install modelscope
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt

echo [setup] 依赖就绪，开始下载模型（约 6.8GB，国内走 ModelScope）...
python download_model.py

echo FULL_SETUP_DONE
