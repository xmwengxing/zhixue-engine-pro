"""
下载 Unlimited-OCR 模型权重到本地 ./model 目录。
优先 HuggingFace（官方 README 示例模型 baidu/Unlimited-OCR，trust_remote_code 匹配），
失败则回退 ModelScope 国内源。

用法（在已激活的 venv 中）：
    python download_model.py
环境变量：
    HF_MODEL_ID      HuggingFace 模型 id（默认 baidu/Unlimited-OCR）
    MS_MODEL_ID      ModelScope 模型 id（默认 PaddlePaddle/Unlimited-OCR）
    MODEL_LOCAL_DIR  本地目录（默认 ./model）
"""
import os
import sys

HF_ID = os.environ.get("HF_MODEL_ID", "baidu/Unlimited-OCR")
MS_ID = os.environ.get("MS_MODEL_ID", "PaddlePaddle/Unlimited-OCR")
LOCAL_DIR = os.environ.get("MODEL_LOCAL_DIR", os.path.join(os.path.dirname(__file__), "model"))


def download_hf(model_id: str) -> str:
    from huggingface_hub import snapshot_download

    print(f"[download] HuggingFace {model_id} → {LOCAL_DIR}")
    return snapshot_download(model_id, local_dir=LOCAL_DIR)


def download_ms(model_id: str) -> str:
    from modelscope import snapshot_download

    print(f"[download] ModelScope {model_id} → {LOCAL_DIR}")
    return snapshot_download(model_id, local_dir=LOCAL_DIR)


def main():
    candidates = [(download_hf, HF_ID), (download_ms, MS_ID)]
    last = None
    for fn, mid in candidates:
        try:
            path = fn(mid)
            print("MODEL_DIR=" + path)
            return
        except Exception as e:
            last = e
            print(f"[download] {mid} 失败：{e}", file=sys.stderr)
    raise last or RuntimeError("全部候选模型下载失败")


if __name__ == "__main__":
    main()
