import { Request, Response } from 'express';
import { adminOcrService } from '../services/adminOcrService';
import { OcrMethod, ProviderStatus } from '@prisma/client';

// 获取所有 OCR 服务商
export const getAllProviders = async (_req: Request, res: Response) => {
  try {
    const providers = await adminOcrService.getAllProviders();
    return res.json({ success: true, data: providers });
  } catch (error: any) {
    console.error('获取 OCR 服务商列表失败:', error);
    return res.status(500).json({ success: false, message: '获取 OCR 服务商列表失败', error: error.message });
  }
};

// 获取单个 OCR 服务商
export const getProviderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ success: false, message: 'ID 参数无效' });
    const provider = await adminOcrService.getProviderById(id);
    if (!provider) return res.status(404).json({ success: false, message: 'OCR 服务商不存在' });
    return res.json({ success: true, data: provider });
  } catch (error: any) {
    console.error('获取 OCR 服务商失败:', error);
    return res.status(500).json({ success: false, message: '获取 OCR 服务商失败', error: error.message });
  }
};

// 创建 OCR 服务商
export const createProvider = async (req: Request, res: Response) => {
  try {
    const { name, method, endpoint, apiKey, model, extra, isDefault, enableForRecognition, status } = req.body;
    if (!name || !method || !endpoint) {
      return res.status(400).json({ success: false, message: '缺少必填字段（name / method / endpoint）' });
    }
    if (!Object.values(OcrMethod).includes(method)) {
      return res.status(400).json({ success: false, message: '无效的识别方式' });
    }
    if (method === 'CUSTOM_API' && !apiKey) {
      return res.status(400).json({ success: false, message: 'CUSTOM_API 需要提供 API Key' });
    }
    if ((method === 'LOCAL_VISION' || method === 'CUSTOM_API' || method === 'PADDLE_OCR_VL') && !model && !extra?.model) {
      return res.status(400).json({ success: false, message: '视觉模型需要提供 model 名称' });
    }
    if (method === 'BAIDU_OCR' && !apiKey) {
      return res.status(400).json({ success: false, message: '百度智能云 OCR 需要提供 API Key' });
    }
    const provider = await adminOcrService.createProvider({
      name,
      method,
      endpoint,
      apiKey,
      model,
      extra,
      isDefault,
      enableForRecognition,
      status,
    });
    return res.status(201).json({ success: true, message: 'OCR 服务商创建成功', data: provider });
  } catch (error: any) {
    console.error('创建 OCR 服务商失败:', error);
    const isValidation = /需要|仅|必须|缺少/.test(error.message || '');
    return res.status(isValidation ? 400 : 500).json({ success: false, message: error.message || '创建 OCR 服务商失败' });
  }
};

// 更新 OCR 服务商
export const updateProvider = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ success: false, message: 'ID 参数无效' });
    const { name, method, endpoint, apiKey, model, extra, isDefault, enableForRecognition, status } = req.body;
    if (method && !Object.values(OcrMethod).includes(method)) {
      return res.status(400).json({ success: false, message: '无效的识别方式' });
    }
    if (status && !Object.values(ProviderStatus).includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态' });
    }
    const provider = await adminOcrService.updateProvider(id, {
      name,
      method,
      endpoint,
      apiKey,
      model,
      extra,
      isDefault,
      enableForRecognition,
      status,
    });
    return res.json({ success: true, message: 'OCR 服务商更新成功', data: provider });
  } catch (error: any) {
    console.error('更新 OCR 服务商失败:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'OCR 服务商不存在' });
    const isValidation = /需要|仅|必须|缺少/.test(error.message || '');
    return res.status(isValidation ? 400 : 500).json({ success: false, message: error.message || '更新 OCR 服务商失败' });
  }
};

// 删除 OCR 服务商
export const deleteProvider = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ success: false, message: 'ID 参数无效' });
    await adminOcrService.deleteProvider(id);
    return res.json({ success: true, message: 'OCR 服务商删除成功' });
  } catch (error: any) {
    console.error('删除 OCR 服务商失败:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'OCR 服务商不存在' });
    return res.status(500).json({ success: false, message: '删除 OCR 服务商失败', error: error.message });
  }
};

// 测试连通性（不保存到数据库）
export const testProvider = async (req: Request, res: Response) => {
  try {
    const { method, endpoint, apiKey, model, extra } = req.body;
    if (!method || !endpoint) {
      return res.status(400).json({ success: false, message: '缺少必填字段（method / endpoint）' });
    }
    if (!Object.values(OcrMethod).includes(method)) {
      return res.status(400).json({ success: false, message: '无效的识别方式' });
    }
    const result = await adminOcrService.testConnection({ method, endpoint, apiKey, model, extra });
    return res.json({ success: true, message: '连通性测试完成', data: result });
  } catch (error: any) {
    console.error('测试 OCR 服务商连通性失败:', error);
    return res.status(500).json({ success: false, message: '测试 OCR 服务商连通性失败', error: error.message });
  }
};
