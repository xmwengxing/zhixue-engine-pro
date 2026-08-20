# ==========================================
# 试卷入库脚本（Fish Shell）
# ==========================================
# 用法: fish 试卷入库.fish [学科] [选项]

function main
    set -l SCRIPT_DIR (status dirname)
    set -l PROJECT_ROOT (realpath "$SCRIPT_DIR/..")
    set -l BACKEND "$PROJECT_ROOT/backend"

    if test (count $argv) -eq 0; or test "$argv[1]" = "--help"
        echo "用法: fish 试卷入库.fish [学科]"
        echo "  fish 试卷入库.fish 数学"
        echo "  fish 试卷入库.fish --all"
        return 0
    end

    command -q node; or begin; echo "❌ 未找到 Node.js"; return 1; end

    set -l ProgressDir "$SCRIPT_DIR/OutputData"
    set -l PaperRoot "$SCRIPT_DIR/SourceData"

    # 学科列表
    set -l Subjects
    if test "$argv[1]" = "--all"
        for f in "$ProgressDir"/progress-*.json
            test -f "$f"; or continue
            set -l Subj (basename "$f" | string replace -r '^progress-' '' | string replace '\.json$' '')
            echo "$Subj" | grep -qE '^(import|formula)$'; and continue
            set -a Subjects $Subj
        end
    else
        set Subjects $argv[1]
    end

    test (count $Subjects) -eq 0; and begin; echo "❌ 未找到转换产物"; return 1; end

    cd $BACKEND
    set -l SubjectsStr (string join , $Subjects)
    node scripts/import-papers-to-db.mjs --subjects $SubjectsStr --progress-dir $ProgressDir --paper-root $PaperRoot
    echo "🎉 入库完成"
end

main $argv
