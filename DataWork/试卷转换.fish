# ==========================================
# 试卷转换脚本（Fish Shell）
# ==========================================
# 用法: fish 试卷转换.fish [学科] [选项]

function main
    set -l SCRIPT_DIR (status dirname)
    set -l PROJECT_ROOT (realpath "$SCRIPT_DIR/..")
    set -l BACKEND "$PROJECT_ROOT/backend"

    if test (count $argv) -eq 0; or test "$argv[1]" = "--help"
        echo "用法: fish 试卷转换.fish [学科]"
        echo "  fish 试卷转换.fish 数学"
        echo "  fish 试卷转换.fish --all"
        return 0
    end

    # 加载 .env
    set -l ENV_FILE "$SCRIPT_DIR/.env"
    if test -f "$ENV_FILE"
        while read -l line
            if string match -rq '^[^#][^=]+=.+' "$line"
                set -l kv (string split = -- "$line")
                set -gx (string trim -- $kv[1]) (string trim -- $kv[2])
            end
        end < "$ENV_FILE"
    end

    # API Key
    if not set -q PADDLE_API_KEY; or test -z "$PADDLE_API_KEY"
        echo "🔑 飞桨 PaddleOCR API Key 未配置"
        echo "   获取: https://paddleocr.aistudio.com.cn/"
        read -P "   请输入 API Key（留空跳过）: " KEY
        if test -n "$KEY"
            echo "PADDLE_API_KEY=$KEY" > "$ENV_FILE"
            set -gx PADDLE_API_KEY "$KEY"
        end
    end

    command -q node; or begin; echo "❌ 未找到 Node.js"; return 1; end

    set -gx PAPER_ROOT "$SCRIPT_DIR/SourceData"
    set -gx OUT_DIR "$SCRIPT_DIR/OutputData"

    # 学科列表
    set -l Subjects
    if test "$argv[1]" = "--all"
        set Subjects (find "$PAPER_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n')
    else
        set Subjects $argv[1]
    end

    test (count $Subjects) -eq 0; and begin; echo "❌ 未找到学科"; return 1; end

    set -l TotalOk 0
    set -l TotalQ 0

    for Subj in $Subjects
        echo "📄 开始转换: $Subj"
        cd $BACKEND
        node scripts/convert-papers-batch.mjs --dir $PAPER_ROOT --subject $Subj --out $OUT_DIR --progress "$OUT_DIR/progress-$Subj.json" --limit 99999

        if string match -qiE '数学|物理|化学|生物' "$Subj"
            if set -q PADDLE_API_KEY; and test -n "$PADDLE_API_KEY"
                node scripts/ocr-formulas.mjs --subject $Subj --progress-dir $OUT_DIR --paper-root $PAPER_ROOT --ocr-usage "$OUT_DIR/ocr-usage.json"
            end
        end

        set -l PF "$OUT_DIR/progress-$Subj.json"
        if test -f "$PF"
            set -l Ok (node -e "const p=JSON.parse(require('fs').readFileSync('$PF','utf8'));console.log(Object.values(p).filter(r=>r.parseStatus==='ok').length)")
            set -l Q (node -e "const p=JSON.parse(require('fs').readFileSync('$PF','utf8'));console.log(Object.values(p).reduce((s,r)=>s+(r.questionCount||0),0))")
            echo "✅ $Subj: $Ok 文件, $Q 题"
            set TotalOk (math $TotalOk + $Ok)
            set TotalQ (math $TotalQ + $Q)
        end
    end

    echo "🎉 转换完成 | 文件: $TotalOk | 题数: $TotalQ"
end

main $argv
