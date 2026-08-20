@echo off
chcp 65001 >nul
cd /d E:\Projects\zhixue-engine-pro\backend

echo ============================================
echo  公式 OCR - 数学 + 物理
echo  每个PDF约2-3分钟，预计总共15-20小时
echo  支持断点续跑（已完成的PDF自动跳过）
echo ============================================
echo.

echo [%date% %time%] 开始数学 OCR...
node scripts/ocr-formulas.mjs --subject 数学 2>&1
echo [%date% %time%] 数学完成

echo.
echo [%date% %time%] 开始物理 OCR...
node scripts/ocr-formulas.mjs --subject 物理 2>&1
echo [%date% %time%] 物理完成

echo.
echo ============================================
echo  OCR 全部完成！
echo  下一步：在 Freebuff 中运行入库脚本
echo ============================================
pause
