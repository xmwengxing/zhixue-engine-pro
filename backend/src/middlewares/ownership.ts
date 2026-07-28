import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuthorizationError } from './errorHandler';
import prisma from '../config/database';

/**
 * 统一数据归属权校验（IDOR 防护）
 * ------------------------------------------------------------------
 * 校验「当前登录用户」是否有权访问「某个 studentId 对应的学员资源」。
 *
 * 规则：
 *  - STUDENT：只能访问自己的资源（studentId === 自己的 userId）。
 *  - PARENT ：只能访问与自己存在 ACTIVE 绑定关系(ParentChildRelation)的子女。
 *  - ADMIN  ：放行（管理员拥有全部访问权限，具体接口仍由角色中间件控制）。
 *
 * 若校验失败，抛出 AuthorizationError（HTTP 403）。
 */

async function assertStudentAccessible(
  user: { userId: string; role: Role },
  studentId: string
): Promise<void> {
  if (!studentId) {
    throw new AuthorizationError('缺少学员标识');
  }

  // 管理员直接放行
  if (user.role === Role.ADMIN) {
    return;
  }

  // 学员只能访问自己
  if (user.role === Role.STUDENT) {
    if (user.userId !== studentId) {
      throw new AuthorizationError('无权访问该学员的资源');
    }
    return;
  }

  // 家长必须与被访问学员存在生效中的绑定关系
  if (user.role === Role.PARENT) {
    const relation = await prisma.parentChildRelation.findFirst({
      where: {
        parentId: user.userId,
        studentId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!relation) {
      throw new AuthorizationError('无权访问该学员的资源（未绑定或已解绑）');
    }
    return;
  }

  throw new AuthorizationError('无权访问该学员的资源');
}

/**
 * 按请求中携带的 studentId 校验归属权。
 * studentId 来源可配置（param / body / query，默认 query）。
 * 若请求中未携带 studentId，则放行——此时由 service 层按「家长绑定子女」集合做作用域过滤。
 */
export function validateOwnership(opts?: {
  source?: 'param' | 'body' | 'query';
  key?: string;
}) {
  const source = opts?.source ?? 'query';
  const key = opts?.key ?? 'studentId';

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthorizationError('用户未认证');
      }

      const valueContainer =
        source === 'param'
          ? req.params
          : source === 'body'
            ? req.body
            : req.query;
      const studentId = (valueContainer as Record<string, unknown> | undefined)?.[
        key
      ] as string | undefined;

      // 未提供 studentId：放行，交由 service 层做作用域过滤
      if (!studentId) {
        return next();
      }

      await assertStudentAccessible(req.user, studentId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 资源级归属权中间件工厂。
 * 根据路由参数中的资源 id 取出其归属学员(studentId)，再校验可访问性。
 * @param getStudentId 通过资源 id 查询其归属 studentId；资源不存在返回 null。
 */
export function validateResourceOwnership(
  getStudentId: (resourceId: string) => Promise<string | null>
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthorizationError('用户未认证');
      }

      const resourceId = req.params.id as string | undefined;
      if (!resourceId) {
        throw new AuthorizationError('缺少资源标识');
      }

      const studentId = await getStudentId(resourceId);
      if (!studentId) {
        throw new AuthorizationError('资源不存在');
      }

      await assertStudentAccessible(req.user, studentId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// ---- 各类资源的归属学员查询器 ----

export const taskOwnership = validateResourceOwnership(async (id) => {
  const task = await prisma.task.findUnique({
    where: { id },
    select: { studentId: true },
  });
  return task?.studentId ?? null;
});

export const reportOwnership = validateResourceOwnership(async (id) => {
  const report = await prisma.report.findUnique({
    where: { id },
    select: { studentId: true },
  });
  return report?.studentId ?? null;
});

export const wishOwnership = validateResourceOwnership(async (id) => {
  const wish = await prisma.wish.findUnique({
    where: { id },
    select: { studentId: true },
  });
  return wish?.studentId ?? null;
});
