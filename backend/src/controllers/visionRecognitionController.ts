import { Request, Response } from 'express';
import multer from 'multer';
import { visionRecognitionService } from '../services/visionRecognitionService';

const upload = multer({ storage: multer.memoryStorage() });

/** 学员/家长上传图片 → 调用非本地视觉模型 → 返回识别文本 */
export const recognize = [
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      let imageBuffer: Buffer | undefined;
      let mime = 'image/png';

      if (file) {
        imageBuffer = file.buffer;
        mime = file.mimetype || 'image/png';
      } else if ((req.body as any)?.image) {
        // 兼容 base64 data URL（前端也可直接传 dataURL）
        const m = /^data:([^;]+);base64,(.*)$/.exec((req.body as any).image);
        mime = m ? m[1] : 'image/png';
        imageBuffer = Buffer.from(m ? m[2] : (req.body as any).image, 'base64');
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return res.status(400).json({ success: false, message: '请上传图片' });
      }

      const text = await visionRecognitionService.recognize(imageBuffer, mime);
      return res.json({ success: true, data: { text } });
    } catch (e: any) {
      console.error('视觉识别失败:', e);
      return res.status(502).json({ success: false, message: e.message });
    }
  },
];
