# 本地 OCR 服务（Unlimited-OCR）

封装 [baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR)（基于 DeepSeek-OCR 的 3B MoE 视觉语言模型），
用于扫描件试卷 / 拍照题目的文字与公式识别。**本地免费、无需 API key**，适合大批量题库录入。

## 与后端的关系

后端 `questionImportService` 在导入图片 / 扫描版 PDF 时，若设置 `OCR_PROVIDER=local`，会向本服务发请求：

- `POST /ocr`        —— 单张图片（png/jpg/...）
- `POST /ocr-pdf`    —— 多页 PDF（自动转图后多页解析）
- `GET  /health`     —— 健康检查

后端环境变量（在 `backend/.env` 中配置）：

```
OCR_PROVIDER=local
OCR_ENDPOINT=http://localhost:8002
```

> 数字版 PDF（有文本层）无需 OCR，后端 `extractText` 会先用 `pdf-parse` 提取文本层，
> 仅当文本过少（< 50 字符）才判定为扫描件并走 OCR。

## 启动步骤

```bash
cd services/ocr-unlimited
python -m venv .venv && .venv\Scripts\activate      # Windows
# 或：python3 -m venv .venv && source .venv/bin/activate  # Linux/Mac

pip install -r requirements.txt

# 首次会下载模型权重（约 6.8GB，baidu/Unlimited-OCR），请保持网络。
python app.py
```

默认监听 `http://0.0.0.0:8002`。可调环境变量：`OCR_PORT`、`OCR_DTYPE`(fp16|bf16|float32)、
`OCR_MODEL_ID`、`OCR_DEVICE`(cuda|cpu)。

## ⚠️ 本机 GTX 1080 Ti（Pascal）适配要点

1. **dtype 用 fp16，不要 bf16**：Pascal(sm_6.1) 无 bf16 硬件支持，服务默认 `OCR_DTYPE=fp16`。
2. **禁用 flash-attn**：服务已设 `attn_implementation="eager"`（原生注意力），避免 Pascal 上缺失的 flash-attn 依赖。
3. **显存**：权重约 6.8GB，1080 Ti 11GB 可跑，但需与「题库抽取用的本地 9B 模型」错峰——
   二者不要同时常驻显存。可在导入扫描件时再启动本服务，数字版导入时停掉以释放显存给抽取模型。
4. **速度**：Pascal 无 TensorCore，单图解析约数秒~十几秒，可接受。

## 验证

```bash
curl http://localhost:8002/health
# 单图
curl -F "file=@试卷扫描.jpg" http://localhost:8002/ocr
# PDF
curl -F "file=@试卷扫描.pdf" http://localhost:8002/ocr-pdf
```
