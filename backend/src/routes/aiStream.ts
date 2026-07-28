/**
 * AI 生成进度 SSE 路由
 * 挂在学员端路由下（已统一经过 authenticate + requireStudent），
 * 完整路径：/api/student/ai/stream/exam/:jobId 与 /api/student/ai/stream/report/:sessionId
 */
import { Router } from 'express';
import { aiStreamController } from '../controllers/aiStreamController';

const router = Router();

router.get('/exam/:jobId', aiStreamController.streamExam);
router.get('/report/:sessionId', aiStreamController.streamReport);

export default router;
