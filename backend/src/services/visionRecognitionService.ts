import { adminOcrService } from './adminOcrService';
import { callVisionApi } from './ocrVisionClient';

/**
 * 学员/家长「图片→文本」识别通道。
 * 仅使用管理端标记为 enableForRecognition 的 CUSTOM_API（非本地）服务商。
 */
export class VisionRecognitionService {
  async recognize(imageBuffer: Buffer, mime: string): Promise<string> {
    const provider = await adminOcrService.getRecognitionProvider();
    if (!provider) {
      throw new Error(
        '未配置视觉识别模型（请在管理端「视觉识别配置」中添加自定义厂商视觉模型，并勾选「用于学员/家长识别」）'
      );
    }
    return callVisionApi(provider, imageBuffer, mime, undefined, 60000);
  }
}

export const visionRecognitionService = new VisionRecognitionService();
