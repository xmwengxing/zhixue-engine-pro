// 删除用户 wsh 的脚本
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteUserWsh() {
  console.log('=== 删除用户 wsh ===\n');

  try {
    // 1. 查找用户
    const user = await prisma.user.findUnique({
      where: { username: 'wsh' },
      include: {
        studentId: true,
        studentProfile: true,
        parentRelations: true,
        studentRelations: true,
        usedAuthCode: true,
      },
    });

    if (!user) {
      console.log('❌ 用户 wsh 不存在');
      return;
    }

    console.log('✓ 找到用户');
    console.log(`  用户ID: ${user.id}`);
    console.log(`  用户名: ${user.username}`);
    console.log(`  角色: ${user.role}`);
    console.log(`  状态: ${user.status}`);
    console.log(`  创建时间: ${user.createdAt}`);
    
    if (user.studentId) {
      console.log(`  学号: ${user.studentId.studentIdNumber}`);
    }

    console.log('\n开始删除相关数据...\n');

    // 2. 删除相关数据（使用事务确保原子性）
    await prisma.$transaction(async (tx) => {
      // 删除学员档案
      if (user.studentProfile) {
        await tx.studentProfile.delete({
          where: { userId: user.id },
        });
        console.log('✓ 已删除学员档案');
      }

      // 释放学号
      if (user.studentId) {
        await tx.studentID.delete({
          where: { id: user.studentId.id },
        });
        console.log(`✓ 已删除学号: ${user.studentId.studentIdNumber}`);
      }

      // 删除亲子关系（作为家长）
      if (user.parentRelations.length > 0) {
        await tx.parentChildRelation.deleteMany({
          where: { parentId: user.id },
        });
        console.log(`✓ 已删除 ${user.parentRelations.length} 条家长关系`);
      }

      // 删除亲子关系（作为学员）
      if (user.studentRelations.length > 0) {
        await tx.parentChildRelation.deleteMany({
          where: { studentId: user.id },
        });
        console.log(`✓ 已删除 ${user.studentRelations.length} 条学员关系`);
      }

      // 释放授权码
      if (user.usedAuthCode) {
        await tx.authCode.update({
          where: { id: user.usedAuthCode.id },
          data: {
            status: 'UNUSED',
            usedBy: null,
            usedAt: null,
          },
        });
        console.log(`✓ 已释放授权码: ${user.usedAuthCode.code}`);
      }

      // 删除训练记录
      const trainingSessions = await tx.trainingSession.deleteMany({
        where: { studentId: user.id },
      });
      if (trainingSessions.count > 0) {
        console.log(`✓ 已删除 ${trainingSessions.count} 条训练记录`);
      }

      // 删除错题记录
      const errorQuestions = await tx.errorQuestion.deleteMany({
        where: { studentId: user.id },
      });
      if (errorQuestions.count > 0) {
        console.log(`✓ 已删除 ${errorQuestions.count} 条错题记录`);
      }

      // 删除任务（作为创建者）
      const createdTasks = await tx.task.deleteMany({
        where: { createdBy: user.id },
      });
      if (createdTasks.count > 0) {
        console.log(`✓ 已删除 ${createdTasks.count} 条创建的任务`);
      }

      // 删除任务（作为执行者）
      const assignedTasks = await tx.task.deleteMany({
        where: { studentId: user.id },
      });
      if (assignedTasks.count > 0) {
        console.log(`✓ 已删除 ${assignedTasks.count} 条分配的任务`);
      }

      // 删除愿望（作为学员）
      const wishes = await tx.wish.deleteMany({
        where: { studentId: user.id },
      });
      if (wishes.count > 0) {
        console.log(`✓ 已删除 ${wishes.count} 条愿望记录`);
      }

      // 删除积分交易记录
      const pointsTransactions = await tx.pointsTransaction.deleteMany({
        where: { studentId: user.id },
      });
      if (pointsTransactions.count > 0) {
        console.log(`✓ 已删除 ${pointsTransactions.count} 条积分交易记录`);
      }

      // 最后删除用户
      await tx.user.delete({
        where: { id: user.id },
      });
      console.log('✓ 已删除用户记录');
    });

    console.log('\n✅ 用户 wsh 及所有相关数据已完全删除');
    console.log('✅ 用户名 wsh 已释放，可以重新注册');

  } catch (error) {
    console.error('\n❌ 删除失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行删除
deleteUserWsh().catch(console.error);
