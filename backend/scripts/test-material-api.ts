import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用的管理员凭证
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'password123',
};

let adminToken = '';
let createdMaterialIds: string[] = [];

/**
 * 管理员登录
 */
async function adminLogin() {
  try {
    console.log('\n========== 管理员登录 ==========');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, ADMIN_CREDENTIALS);
    
    if (response.data.success && response.data.data.token) {
      adminToken = response.data.data.token;
      console.log('✅ 管理员登录成功');
      console.log('Token:', adminToken.substring(0, 20) + '...');
      return true;
    } else {
      console.log('❌ 登录失败:', response.data);
      return false;
    }
  } catch (error: any) {
    console.error('❌ 登录请求失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 创建教材节点
 */
async function createMaterial(name: string, type: string, parentId?: string) {
  try {
    console.log(`\n创建教材节点: ${name} (${type})`);
    const response = await axios.post(
      `${API_BASE_URL}/admin/materials`,
      {
        name,
        type,
        parentId,
        order: 0,
        metadata: {
          description: `${name}的描述`,
          keywords: [name],
        },
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (response.data.success) {
      console.log('✅ 创建成功');
      console.log('节点 ID:', response.data.data.id);
      createdMaterialIds.push(response.data.data.id);
      return response.data.data;
    } else {
      console.log('❌ 创建失败:', response.data);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 创建请求失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 获取所有教材节点
 */
async function getAllMaterials() {
  try {
    console.log('\n========== 获取所有教材节点 ==========');
    const response = await axios.get(`${API_BASE_URL}/admin/materials`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (response.data.success) {
      console.log('✅ 获取成功');
      console.log('教材树结构:', JSON.stringify(response.data.data, null, 2));
      return response.data.data;
    } else {
      console.log('❌ 获取失败:', response.data);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 获取请求失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 根据 ID 获取教材节点
 */
async function getMaterialById(id: string) {
  try {
    console.log(`\n获取教材节点: ${id}`);
    const response = await axios.get(`${API_BASE_URL}/admin/materials/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (response.data.success) {
      console.log('✅ 获取成功');
      console.log('节点信息:', response.data.data);
      return response.data.data;
    } else {
      console.log('❌ 获取失败:', response.data);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 获取请求失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 更新教材节点
 */
async function updateMaterial(id: string, updates: any) {
  try {
    console.log(`\n更新教材节点: ${id}`);
    const response = await axios.put(
      `${API_BASE_URL}/admin/materials/${id}`,
      updates,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (response.data.success) {
      console.log('✅ 更新成功');
      console.log('更新后的节点:', response.data.data);
      return response.data.data;
    } else {
      console.log('❌ 更新失败:', response.data);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 更新请求失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 删除教材节点
 */
async function deleteMaterial(id: string) {
  try {
    console.log(`\n删除教材节点: ${id}`);
    const response = await axios.delete(`${API_BASE_URL}/admin/materials/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (response.data.success) {
      console.log('✅ 删除成功');
      return true;
    } else {
      console.log('❌ 删除失败:', response.data);
      return false;
    }
  } catch (error: any) {
    console.error('❌ 删除请求失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 批量导入教材数据
 */
async function importMaterials() {
  try {
    console.log('\n========== 批量导入教材数据 ==========');
    const materials = [
      {
        name: '人教版',
        type: 'VERSION',
        order: 1,
      },
      {
        name: '苏教版',
        type: 'VERSION',
        order: 2,
      },
    ];

    const response = await axios.post(
      `${API_BASE_URL}/admin/materials/import`,
      { materials },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (response.data.success) {
      console.log('✅ 导入成功');
      console.log('导入结果:', response.data.message);
      console.log('详细信息:', response.data.data);
      
      // 保存成功创建的节点 ID
      response.data.data.forEach((result: any) => {
        if (result.success && result.material?.id) {
          createdMaterialIds.push(result.material.id);
        }
      });
      
      return response.data.data;
    } else {
      console.log('❌ 导入失败:', response.data);
      return null;
    }
  } catch (error: any) {
    console.error('❌ 导入请求失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 测试删除有子节点的节点（应该失败）
 */
async function testDeleteWithChildren(parentId: string) {
  try {
    console.log('\n========== 测试删除有子节点的节点 ==========');
    const response = await axios.delete(`${API_BASE_URL}/admin/materials/${parentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    console.log('❌ 应该失败但成功了:', response.data);
    return false;
  } catch (error: any) {
    if (error.response?.data?.message?.includes('子节点')) {
      console.log('✅ 正确阻止了删除操作:', error.response.data.message);
      return true;
    } else {
      console.error('❌ 意外的错误:', error.response?.data || error.message);
      return false;
    }
  }
}

/**
 * 清理测试数据
 */
async function cleanup() {
  console.log('\n========== 清理测试数据 ==========');
  
  // 反向删除（先删除子节点）
  for (let i = createdMaterialIds.length - 1; i >= 0; i--) {
    const id = createdMaterialIds[i];
    await deleteMaterial(id);
  }
  
  console.log('✅ 清理完成');
}

/**
 * 主测试流程
 */
async function main() {
  console.log('========================================');
  console.log('教材管理 API 测试');
  console.log('========================================');

  // 1. 管理员登录
  const loginSuccess = await adminLogin();
  if (!loginSuccess) {
    console.log('\n❌ 登录失败，终止测试');
    return;
  }

  // 2. 创建教材节点（构建树形结构）
  console.log('\n========== 创建教材节点 ==========');
  
  // 创建版本节点
  const version = await createMaterial('人教版', 'VERSION');
  if (!version) return;

  // 创建年级节点
  const grade = await createMaterial('七年级', 'GRADE', version.id);
  if (!grade) return;

  // 创建科目节点
  const subject = await createMaterial('数学', 'SUBJECT', grade.id);
  if (!subject) return;

  // 创建单元节点
  const unit = await createMaterial('第一单元：有理数', 'UNIT', subject.id);
  if (!unit) return;

  // 创建章节节点
  const chapter = await createMaterial('1.1 正数和负数', 'CHAPTER', unit.id);
  if (!chapter) return;

  // 3. 获取所有教材节点
  await getAllMaterials();

  // 4. 根据 ID 获取教材节点
  await getMaterialById(version.id);

  // 5. 更新教材节点
  await updateMaterial(chapter.id, {
    name: '1.1 正数和负数（修订版）',
    metadata: {
      description: '介绍正数和负数的概念',
      keywords: ['正数', '负数', '有理数'],
    },
  });

  // 6. 测试删除有子节点的节点（应该失败）
  await testDeleteWithChildren(version.id);

  // 7. 批量导入教材数据
  await importMaterials();

  // 8. 再次获取所有教材节点
  await getAllMaterials();

  // 9. 清理测试数据
  await cleanup();

  console.log('\n========================================');
  console.log('✅ 所有测试完成');
  console.log('========================================');
}

// 运行测试
main().catch((error) => {
  console.error('测试过程中发生错误:', error);
  process.exit(1);
});
