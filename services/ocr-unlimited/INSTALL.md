# Unlimited-OCR 本地安装与部署指南

> 适用服务：`services/ocr-unlimited/`（封装 [baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR)，基于 DeepSeek-OCR 的 3B MoE 视觉语言模型 VLM）
> 用途：扫描件试卷 / 拍照题目的**文字与公式识别**，本地免费、无需任何 API key。
> 上游 `questionImportService` 在 `OCR_PROVIDER=local` 时调用本服务的 `POST /ocr`。

---

## 0. 三种方案与现状

| 方案 | 说明 | 现状 |
|------|------|------|
| A. Unlimited-OCR 本地服务（本文档） | 专用 OCR VLM，识别质量最佳 | 代码/依赖就绪，**模型权重下载中**，待你手动验证 |
| B. 升级显卡 | 换支持 bf16 的新卡走 GPU 路线 | 未实施 |
| C. Ollama 视觉模型 | 用 `Qwopus3.5-9B-Coder-MTP-Q4_K_M` 做 OCR | **已实测可用**（见文末「方案 C 备选」） |

> 如果你只想尽快跑通扫描件导入，可先走方案 C（无需下载 6.8GB 模型，本地已有）；
> 追求更高 OCR 精度再按本文档部署方案 A。

---

## 1. 环境要求

| 项 | 要求 | 本机实际情况 |
|----|------|--------------|
| Python | 3.10 ~ 3.12（建议 3.11） | venv 已建好 |
| 内存 | ≥ 16GB（CPU 推理会吃内存） | — |
| 磁盘 | ≥ 15GB 空闲（模型 ~7GB + 缓存） | `model/` 已落部分文件 |
| 显卡 | 可选；GPU 路线需 **sm_70+**（见 §2） | GTX 1080 Ti = **Pascal sm_61** ❌ |

---

## 2. ⚠️ 硬件约束（必读）

本机 **GTX 1080 Ti 是 Pascal 架构（sm_61）**，带来两条死结：

1. **bf16 不支持** → 服务已改用 `fp16`（`OCR_DTYPE=fp16`），无需 flash-attn，用 `attn_implementation="eager"`。
2. **PyTorch ≥ 2.6 已移除 sm_61 内核**；含 sm_61 的最后一个版本是 torch 2.5.1，但官方只提供 **cp312** wheel，而本机缺 Python 3.12，且 `python.org` 在代理下不可达，无法安装 → **GPU 路线在本机不可行**。

**结论：本机走 CPU 推理路线**（已验证 torch 2.13.0+cpu 可加载并运行，慢但可用）。
若日后换支持 bf16 的新显卡 + Python 3.12，可切回 GPU 路线（见 §4 注释）。

---

## 3. 网络与代理要点（必读）

下载依赖与模型权重需要联网，本环境通过 HTTP 代理访问外网：

- **代理地址**：`http://192.168.31.181:4067`（在终端执行命令前 `set` 环境变量）
- **已放行**：HuggingFace（`huggingface.co`）、PyPI（`pypi.org`）
- **未放行**：`python.org`、`github.com`（仅影响从官网下 Python / 拉 git 源码，不影响 pip 与模型下载）
- **单文件 > 62MB 会被代理断流** → 必须用 **`hf_xet`** 分块下载（已写入依赖），不要直接 `wget` 大模型权重。

```bat
:: Windows CMD 设置代理（每次开新终端都要执行）
set http_proxy=http://192.168.31.181:4067
set https_proxy=http://192.168.31.181:4067
```

---

## 4. 安装步骤

> 下面以 Windows + Git Bash / CMD 为例。当前 venv（`.venv/`）已建，可跳过「创建 venv」。

### 步骤 1：准备虚拟环境（如全新机器）

```bat
cd services\ocr-unlimited
python -m venv .venv
.venv\Scripts\activate
```

### 步骤 2：安装依赖

先装 torch（**单独装，且必须指定 PyTorch 源**，否则会装成残缺 CPU 版）：

```bat
:: —— 本机 CPU 路线（推荐）——
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

:: —— GPU 路线（仅限 sm_70+ 显卡 + Python3.12 机器）——
:: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
```

再装其余依赖（含 huggingface_hub / hf_xet）：

```bat
pip install -r requirements.txt
```

### 步骤 3：下载模型权重

设置代理后运行下载脚本（优先 HuggingFace，失败回退 ModelScope）：

```bat
set http_proxy=http://192.168.31.181:4067
set https_proxy=http://192.168.31.181:4067
python download_model.py
```

- 默认下载到 `./model`，模型 id `baidu/Unlimited-OCR`（约 6.8GB）。
- 安装了 `hf_xet` 后，`huggingface_hub` 会自动**分块传输**，规避 >62MB 断流。
- 下载耗时视网速 15~40 分钟，请勿中途中断。

**验证下载完整**：`model/` 目录下应出现若干 `*.safetensors` 权重分片（参考 `model.safetensors.index.json` 中列出的文件名）。若只有 `config.json`/`README.md` 而无分片，说明仍在下载，稍候重试或检查代理。

可选环境变量：

```bat
set HF_MODEL_ID=baidu/Unlimited-OCR      :: 自定义 HF 模型 id
set MS_MODEL_ID=PaddlePaddle/Unlimited-OCR   :: 回退用的 ModelScope id
set MODEL_LOCAL_DIR=./model              :: 本地目录
```

### 步骤 4：启动服务

```bat
:: 可选环境变量
set OCR_PORT=8002          :: 监听端口（默认 8002）
set OCR_DEVICE=cpu         :: cpu / cuda，默认自动检测
set OCR_DTYPE=fp16         :: fp16(默认) / bf16 / float32
set OCR_MODEL_ID=baidu/Unlimited-OCR

python app.py
```

首次请求时会**懒加载**模型（约需数十秒到几分钟，取决于 CPU），之后常驻显存/内存。日志出现 `[ocr] 模型加载完成` 即就绪。

---

## 5. 测试验证

### 5.1 健康检查

```bat
curl http://localhost:8002/health
:: 期望：{"status":"ok"}
```

### 5.2 单图 OCR

生成一张模拟扫描题测试图（保存到 `%TEMP%/test_ocr.png`）：

```bat
python gen_test_image.py
```

再调用 `/ocr`（任意含文字的图片均可，自行替换为实际路径）：

```bat
curl -F "file=@%TEMP%/test_ocr.png" http://localhost:8002/ocr
:: 期望返回 JSON：{"text":"数学测验（模拟扫描件）\n1. 计算：(-3)^2 + √16 = ?\n...","pages":null}
```

### 5.3 PDF OCR

```bat
curl -F "file=@扫描卷.pdf" http://localhost:8002/ocr-pdf
```

---

## 6. 与后端接线

`backend/src/services/questionImportService.ts` 中 `extractText` 在 PDF 文本不足时判定为扫描件，调用 `ocrFromImage`：

- `ocrFromImage` 当 `OCR_PROVIDER=local` 时请求 `http://localhost:8002/ocr`（超时 600s）。
- 后端 `.env` 配置示例：

```ini
OCR_PROVIDER=local
# OCR 服务地址（默认 http://localhost:8002，无需改）
```

启动 OCR 服务后，导入扫描件 PDF / 图片即走 `OCR → normalizeWithLLM(本地 Qwen 抽取) → 落库` 全链路。

---

## 7. 故障排查

| 现象 | 原因 / 处理 |
|------|-------------|
| `No module named 'torch'` | 步骤 2 的 torch 单独安装未执行或被默认源覆盖，重装并指定 `--index-url` |
| 下载到一半卡死 / 报 62MB 截断 | 未用 `hf_xet`；确认已 `pip install hf_xet`，且代理已 `set` |
| `CUDA out of memory` / sm_61 报错 | 本机不支持 GPU 路线，设 `OCR_DEVICE=cpu` |
| 首次请求极慢 | 模型懒加载中，等日志 `[ocr] 模型加载完成` |
| 返回 `text` 为空 | 图片无文字 / 分辨率过低；调高图片清晰度或检查 `app.py` 的 `base_size`/`image_size` |
| `trust_remote_code` 报错 | 确认 `transformers==4.57.1` 且 `model/` 含 `modeling_*.py` 代码文件 |

---

## 8. 方案 C 备选：Ollama 视觉模型（已实测可用）

本地 Ollama 模型 **`Qwopus3.5-9B-Coder-MTP-Q4_K_M:latest`** 已确认支持视觉输入，可直接用作 OCR，免去下载 6.8GB 模型：

```bat
:: 用 Ollama 原生接口（think:false 关闭思考，输出干净文本）
curl http://localhost:11434/api/chat -d "{
  \"model\": \"Qwopus3.5-9B-Coder-MTP-Q4_K_M:latest\",
  \"messages\": [{\"role\":\"user\",\"content\":\"请识别并转录图片中的所有文字与公式\",\"images\":[\"<base64>\"]}],
  \"think\": false, \"stream\": false
}"
```

实测可准确转录中文、数学公式、分数与英文数字。若要接入导入链路，可在 `questionImportService.ocrFromImage` 增加 `OCR_PROVIDER=ollama` 分支，改用 Ollama 原生 `/api/chat` 送图（参考 `backend/src/services/aiServiceManager.ts` 的 `OllamaNativeAdapter`）。

---

## 9. 目录速查

```
services/ocr-unlimited/
├── app.py            # FastAPI 服务（/health /ocr /ocr-pdf）
├── download_model.py # 模型下载（HF 优先，ModelScope 回退）
├── requirements.txt  # 依赖清单（torch 需单独装）
├── gen_test_image.py # 生成测试图到 %TEMP%/test_ocr.png
├── vision_test.py    # 方案 C 视觉验证脚本（生成图 + 调 Ollama）
├── test_vision_ollama.py # 同上（当前使用）
├── model/            # 模型权重目录（下载目标）
└── .venv/            # Python 虚拟环境（本机已建）
```
