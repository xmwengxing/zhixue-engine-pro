"""
英语单词发音微服务（Python + edge-tts）

提供单词/文本转语音（mp3），供后端听写训练调用。
edge-tts 使用微软在线 TTS，需联网；失败时前端降级 Web Speech API。

启动：uvicorn app:app --host 0.0.0.0 --port 8010
依赖：pip install edge-tts fastapi uvicorn
"""
import io
from typing import List, Optional

import edge_tts
from fastapi import FastAPI, Response
from pydantic import BaseModel

app = FastAPI(title="Word TTS Service", version="1.0.0")

DEFAULT_VOICE = "en-US-AriaNeural"  # 美音女声
VOICES = {
    "us": "en-US-AriaNeural",
    "uk": "en-GB-SoniaNeural",
}


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    rate: Optional[str] = None  # "+0%" / "-10%" 等


class BatchTTSRequest(BaseModel):
    texts: List[str]
    voice: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/tts")
async def tts(req: TTSRequest):
    """单词/短句 → mp3 音频流"""
    voice = VOICES.get(req.voice or "", req.voice or DEFAULT_VOICE)
    rate = req.rate or "+0%"
    communicate = edge_tts.Communicate(req.text, voice=voice, rate=rate)
    buffer = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])
    data = buffer.getvalue()
    if not data:
        return Response(status_code=502, content="TTS 生成失败")
    return Response(content=data, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.post("/tts/batch")
async def tts_batch(req: BatchTTSRequest):
    """批量生成（返回 {text: mp3 base64} 供前端缓存；文本多时建议逐个调用避免超时）"""
    import base64

    voice = VOICES.get(req.voice or "", req.voice or DEFAULT_VOICE)
    out = {}
    for text in req.texts[:20]:
        try:
            communicate = edge_tts.Communicate(text, voice=voice)
            buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buffer.write(chunk["data"])
            if buffer.getvalue():
                out[text] = base64.b64encode(buffer.getvalue()).decode()
        except Exception:
            continue
    return {"data": out}
