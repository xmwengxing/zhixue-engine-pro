@echo off
REM 本地 OCR 服务一键安装（Windows）
REM 1) 建 venv  2) 装 CUDA 版 torch  3) 装其余依赖  4) 装 modelscope（用于下载模型）
cd /d %~dp0

python -m venv .venv
if errorlevel 1 (
  echo [setup] 创建 venv 失败，请确认 python 在 PATH 中
  exit /b 1
)
call .venv\Scripts\activate

pip install -U pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
pip install modelscope

echo [setup] 依赖安装完成。下一步下载模型：python download_model.py
