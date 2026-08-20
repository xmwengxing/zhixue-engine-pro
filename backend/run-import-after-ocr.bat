@echo off
chcp 65001 >nul
cd /d E:\Projects\zhixue-engine-pro\backend

echo ============================================
echo  清空数据库 + 重新入库（数学+物理）
echo  其他学科（英语/语文/历史）数据不变
echo ============================================
echo.

echo [%date% %time%] 清空数学/物理题目...
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); (async () => { const r = await p.question.deleteMany({ where: { paper: { subject: { in: ['数学','物理'] } } } }); console.log('删除', r.count, '条'); await p.\$disconnect(); })()"
echo.

echo [%date% %time%] 重新入库数学...
node scripts/import-papers-to-db.mjs --subject 数学 2>&1
echo [%date% %time%] 数学入库完成

echo.
echo [%date% %time%] 重新入库物理...
node scripts/import-papers-to-db.mjs --subject 物理 2>&1
echo [%date% %time%] 物理入库完成

echo.
echo ============================================
echo  入库完成！重启前端查看效果
echo ============================================
pause
