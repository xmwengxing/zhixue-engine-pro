"""
本地 OCR 微服务：封装 baidu/Unlimited-OCR（基于 DeepSeek-OCR 的 3B MoE VLM）。

适用于扫描件试卷 / 拍照题目的文字与公式识别。本地免费、无需 API key。
参考官方 Transformers 用法（https://github.com/baidu/Unlimited-OCR）：
    from transformers import AutoModel, AutoTokenizer
    model = AutoModel.from_pretrained('baidu/Unlimited-OCR', trust_remote_code=True,
                                      use_safetensors=True, torch_dtype=torch.bfloat16)
    model.infer(tokenizer, prompt='<image>document parsing.',
                image_file='x.jpg', output_path='out',
                base_size=1024, image_size=640, crop_mode=True,
                max_length=32768, no_repeat_ngram_size=35, ngram_window=128,
                save_results=True)

针对本机 GTX 1080 Ti（Pascal, sm_6.1）的注意事项：
  * Pascal 无 bf16 硬件支持，改用 fp16（OCR_DTYPE 可覆盖）。
  * Pascal 无 flash-attn，使用 attn_implementation="eager" 原生注意力。
  * 权重约 6.8GB，建议显存 >= 12GB；1080 Ti(11GB) 可跑但需与抽取模型错峰。

启动：
  pip install -r requirements.txt
  python app.py            # 默认端口 8002
环境变量：
  OCR_PORT        监听端口（默认 8002）
  OCR_DTYPE       torch dtype: fp16(默认) | bf16 | float32
  OCR_MODEL_ID    模型名（默认 baidu/Unlimited-OCR）
  OCR_DEVICE      cuda | cpu（默认自动）
"""
import io
import json
import os
import glob
import tempfile
from typing import List, Optional

import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Unlimited-OCR Service", version="1.0.0")

MODEL_ID = os.environ.get("OCR_MODEL_ID", "baidu/Unlimited-OCR")
DEVICE = os.environ.get("OCR_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
DTYPE = os.environ.get("OCR_DTYPE", "fp16")

_DTYPE_MAP = {
    "fp16": torch.float16,
    "bf16": torch.bfloat16,
    "float32": torch.float32,
}
_torch_dtype = _DTYPE_MAP.get(DTYPE, torch.float16)

_model = None
_tokenizer = None


def _load():
    """懒加载模型（首次请求时），避免在抽取模型占用 GPU 时重复占用显存。"""
    global _model, _tokenizer
    if _model is not None:
        return
    from transformers import AutoModel, AutoTokenizer

    print(f"[ocr] 加载模型 {MODEL_ID} → device={DEVICE} dtype={_torch_dtype}")
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    _model = AutoModel.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
        use_safetensors=True,
        torch_dtype=_torch_dtype,
        attn_implementation="eager",  # 兼容 Pascal，避免 flash-attn 依赖
    )
    _model = _model.eval().to(DEVICE)
    print("[ocr] 模型加载完成")


def _read_outputs(output_dir: str) -> str:
    """防御式读取 infer 写出的结果：json 优先解析 text 字段，否则按 txt 读取。"""
    parts: List[str] = []
    for pat in ("*.json", "*.txt", "*.md"):
        for fp in sorted(glob.glob(os.path.join(output_dir, pat))):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                if fp.endswith(".json"):
                    try:
                        obj = json.loads(content)
                        if isinstance(obj, dict):
                            content = obj.get("text") or obj.get("result") or obj.get("content") or content
                        elif isinstance(obj, list):
                            content = "\n".join(
                                str(x.get("text", x) if isinstance(x, dict) else x) for x in obj
                            )
                    except Exception:
                        pass
                if content:
                    parts.append(content)
            except Exception:
                continue
    return "\n\n".join(p for p in parts if p)


def _single_image(image_bytes: bytes, ext: str) -> str:
    """单张图片 OCR。"""
    import PIL.Image as Image

    _load()
    with tempfile.TemporaryDirectory(prefix="ocr_") as tmp:
        img_path = os.path.join(tmp, f"input{ext or '.png'}")
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        with open(img_path, "wb") as f:
            f.write(image_bytes)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # 优先使用图片对象；部分版本需传路径，二者兼容。
        try:
            ret = _model.infer(
                _tokenizer,
                prompt="<image>document parsing.",
                image=image,
                output_path=out_dir,
                base_size=1024,
                image_size=640,
                crop_mode=True,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=128,
                save_results=True,
            )
        except TypeError:
            ret = _model.infer(
                _tokenizer,
                prompt="<image>document parsing.",
                image_file=img_path,
                output_path=out_dir,
                base_size=1024,
                image_size=640,
                crop_mode=True,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=128,
                save_results=True,
            )
        text = _read_outputs(out_dir)
        if not text and isinstance(ret, str):
            text = ret
        elif not text and isinstance(ret, list):
            text = "\n".join(str(x) for x in ret)
        return text or ""


def _pdf_ocr(pdf_bytes: bytes) -> str:
    """PDF OCR：先转图片再多页解析。"""
    import fitz  # PyMuPDF
    import PIL.Image as Image

    _load()
    work = tempfile.mkdtemp(prefix="pdf_ocr_")
    try:
        pdf_path = os.path.join(work, "doc.pdf")
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        doc = fitz.open(pdf_path)
        mat = fitz.Matrix(300 / 72, 300 / 72)
        page_paths = []
        for i, page in enumerate(doc):
            out = os.path.join(work, f"page_{i+1:04d}.png")
            page.get_pixmap(matrix=mat).save(out)
            page_paths.append(out)
        doc.close()

        out_dir = os.path.join(work, "out")
        os.makedirs(out_dir, exist_ok=True)

        try:
            _model.infer_multi(
                _tokenizer,
                prompt="<image>Multi page parsing.",
                image_files=page_paths,
                output_path=out_dir,
                image_size=1024,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=1024,
                save_results=True,
            )
        except TypeError:
            # 兼容 image 对象列表入参
            images = [Image.open(p).convert("RGB") for p in page_paths]
            _model.infer_multi(
                _tokenizer,
                prompt="<image>Multi page parsing.",
                images=images,
                output_path=out_dir,
                image_size=1024,
                max_length=32768,
                no_repeat_ngram_size=35,
                ngram_window=1024,
                save_results=True,
            )
        return _read_outputs(out_dir)
    finally:
        # 成功则清理临时目录；失败保留以便排查
        try:
            import shutil

            if os.path.exists(work):
                shutil.rmtree(work, ignore_errors=True)
        except Exception:
            pass


class OCRResponse(BaseModel):
    text: str
    pages: Optional[List[str]] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr", response_model=OCRResponse)
async def api_ocr(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".png"
    try:
        text = _single_image(data, ext)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR 失败: {e}")
    return OCRResponse(text=text)


@app.post("/ocr-pdf", response_model=OCRResponse)
async def api_ocr_pdf(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    try:
        text = _pdf_ocr(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF OCR 失败: {e}")
    return OCRResponse(text=text)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("OCR_PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
