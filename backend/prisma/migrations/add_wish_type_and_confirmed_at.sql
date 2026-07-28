-- 添加愿望类型枚举
CREATE TYPE "WishType" AS ENUM ('CASH', 'CUSTOM');

-- 添加愿望类型字段（默认为 CUSTOM）
ALTER TABLE "wishes" ADD COLUMN "type" "WishType" NOT NULL DEFAULT 'CUSTOM';

-- 添加学员确认时间字段
ALTER TABLE "wishes" ADD COLUMN "confirmed_at" TIMESTAMP(3);

-- 更新 WishStatus 枚举的注释
COMMENT ON TYPE "WishStatus" IS '愿望状态：PENDING-待审批, APPROVED-已批准(待学员确认), REJECTED-已拒绝, FULFILLED-已兑现(学员已确认并扣除积分)';
