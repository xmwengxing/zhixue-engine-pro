/**
 * 缓存服务
 * 封装常用的缓存操作，用于缓存热点数据
 */

import { getCache } from '../utils/cache';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 用户信息缓存
 */
export class UserCacheService {
  private static readonly KEY_PREFIX = 'user';
  private static readonly TTL = 1800; // 30 分钟

  /**
   * 获取用户信息（带缓存）
   */
  static async getUserById(userId: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${userId}`;

    // 尝试从缓存获取
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (user) {
      // 存入缓存
      await cache.set(cacheKey, user, this.TTL);
    }

    return user;
  }

  /**
   * 清除用户缓存
   */
  static async clearUserCache(userId: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${userId}`;
    await cache.delete(cacheKey);
  }

  /**
   * 清除所有用户缓存
   */
  static async clearAllUserCache() {
    const cache = getCache();
    await cache.deletePattern(`${this.KEY_PREFIX}:*`);
  }
}

/**
 * 教材树缓存
 */
export class MaterialCacheService {
  private static readonly KEY_PREFIX = 'material';
  private static readonly TREE_KEY = 'material:tree';
  private static readonly TTL = 3600; // 1 小时

  /**
   * 获取教材树（带缓存）
   */
  static async getMaterialTree() {
    const cache = getCache();

    // 尝试从缓存获取
    const cached = await cache.get(this.TREE_KEY);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const materials = await prisma.materialNode.findMany({
      orderBy: [
        { parentId: 'asc' },
        { order: 'asc' },
      ],
    });

    // 构建树形结构
    const tree = this.buildTree(materials);

    // 存入缓存
    await cache.set(this.TREE_KEY, tree, this.TTL);

    return tree;
  }

  /**
   * 获取单个教材节点（带缓存）
   */
  static async getMaterialById(materialId: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${materialId}`;

    // 尝试从缓存获取
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const material = await prisma.materialNode.findUnique({
      where: { id: materialId },
    });

    if (material) {
      // 存入缓存
      await cache.set(cacheKey, material, this.TTL);
    }

    return material;
  }

  /**
   * 清除教材树缓存
   */
  static async clearMaterialTreeCache() {
    const cache = getCache();
    await cache.delete(this.TREE_KEY);
  }

  /**
   * 清除单个教材节点缓存
   */
  static async clearMaterialCache(materialId: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${materialId}`;
    await cache.delete(cacheKey);
  }

  /**
   * 清除所有教材缓存
   */
  static async clearAllMaterialCache() {
    const cache = getCache();
    await cache.deletePattern(`${this.KEY_PREFIX}:*`);
  }

  /**
   * 构建树形结构
   */
  private static buildTree(materials: any[]): any[] {
    const map = new Map();
    const roots: any[] = [];

    // 创建映射
    materials.forEach(material => {
      map.set(material.id, { ...material, children: [] });
    });

    // 构建树
    materials.forEach(material => {
      const node = map.get(material.id);
      if (material.parentId) {
        const parent = map.get(material.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }
}

/**
 * 学员档案缓存
 */
export class ProfileCacheService {
  private static readonly KEY_PREFIX = 'profile';
  private static readonly TTL = 1800; // 30 分钟

  /**
   * 获取学员档案（带缓存）
   */
  static async getProfileByUserId(userId: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${userId}`;

    // 尝试从缓存获取
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
    });

    if (profile) {
      // 存入缓存
      await cache.set(cacheKey, profile, this.TTL);
    }

    return profile;
  }

  /**
   * 清除学员档案缓存
   */
  static async clearProfileCache(userId: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${userId}`;
    await cache.delete(cacheKey);
  }

  /**
   * 清除所有档案缓存
   */
  static async clearAllProfileCache() {
    const cache = getCache();
    await cache.deletePattern(`${this.KEY_PREFIX}:*`);
  }
}

/**
 * AI 服务商配置缓存
 */
export class AIProviderCacheService {
  private static readonly KEY_PREFIX = 'ai_provider';
  private static readonly ALL_KEY = 'ai_provider:all';
  private static readonly TTL = 600; // 10 分钟

  /**
   * 获取所有活跃的 AI 服务商（带缓存）
   */
  static async getActiveProviders() {
    const cache = getCache();

    // 尝试从缓存获取
    const cached = await cache.get(this.ALL_KEY);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const providers = await prisma.aIProvider.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { priority: 'asc' },
    });

    // 存入缓存
    await cache.set(this.ALL_KEY, providers, this.TTL);

    return providers;
  }

  /**
   * 清除 AI 服务商缓存
   */
  static async clearProviderCache() {
    const cache = getCache();
    await cache.deletePattern(`${this.KEY_PREFIX}:*`);
  }
}

/**
 * 科目教学指令缓存
 */
export class SubjectInstructionCacheService {
  private static readonly KEY_PREFIX = 'subject_instruction';
  private static readonly TTL = 1800; // 30 分钟

  /**
   * 获取科目教学指令（带缓存）
   */
  static async getInstructionBySubject(subject: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${subject}`;

    // 尝试从缓存获取
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 从数据库查询
    const instruction = await prisma.subjectInstruction.findUnique({
      where: { subject },
    });

    if (instruction) {
      // 存入缓存
      await cache.set(cacheKey, instruction, this.TTL);
    }

    return instruction;
  }

  /**
   * 清除科目教学指令缓存
   */
  static async clearInstructionCache(subject: string) {
    const cache = getCache();
    const cacheKey = `${this.KEY_PREFIX}:${subject}`;
    await cache.delete(cacheKey);
  }

  /**
   * 清除所有科目教学指令缓存
   */
  static async clearAllInstructionCache() {
    const cache = getCache();
    await cache.deletePattern(`${this.KEY_PREFIX}:*`);
  }
}
