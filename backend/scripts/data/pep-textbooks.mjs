// 人教版（人民教育出版社）教材体系初始数据 —— 小学 + 初中 全年级全科目
// 单元目录基于教育部审定教材目录（2024 秋起一年级/七年级启用 2022 课标新版；其余为现行版）
// 结构：{ subject, grade, term, description, units: [{seq, name}] }
// 音体美等无严格单元划分的科目：仅建教材节点（units 空，metadata.notes 说明）

const u = (seq, name) => ({ seq, name });
const units = (arr) => arr.map((name, i) => u(i + 1, name));

// ================= 小学（1-6 年级） =================
// ---- 语文（统编，2024 一年级起新版；单元以「第X单元」划分，主题课文略）----
const XXYW = (desc, count = 8) => ({ description: desc, units: Array.from({ length: count }, (_, i) => u(i + 1, `第${'一二三四五六七八九十'[i] || i + 1}单元`)) });

// ---- 数学（人教版）----
const M1U = ['准备课', '位置', '1~5的认识和加减法', '认识图形（一）', '6~10的认识和加减法', '11~20各数的认识', '认识钟表', '20以内的进位加法', '总复习'];
const M1D = ['认识图形（二）', '20以内的退位减法', '分类与整理', '100以内数的认识', '认识人民币', '100以内的加法和减法（一）', '找规律', '总复习'];
const M2U = ['长度单位', '100以内的加法和减法（二）', '角的初步认识', '表内乘法（一）', '观察物体（一）', '表内乘法（二）', '认识时间', '数学广角——搭配（一）', '总复习'];
const M2D = ['数据收集整理', '表内除法（一）', '图形的运动（一）', '表内除法（二）', '混合运算', '有余数的除法', '万以内数的认识', '克和千克', '数学广角——推理', '总复习'];
const M3U = ['时、分、秒', '万以内的加法和减法（一）', '测量', '万以内的加法和减法（二）', '倍的认识', '多位数乘一位数', '长方形和正方形', '分数的初步认识', '数学广角——集合', '总复习'];
const M3D = ['位置与方向（一）', '除数是一位数的除法', '复式统计表', '两位数乘两位数', '面积', '年、月、日', '小数的初步认识', '数学广角——搭配（二）', '总复习'];
const M4U = ['大数的认识', '公顷和平方千米', '角的度量', '三位数乘两位数', '平行四边形和梯形', '除数是两位数的除法', '条形统计图', '数学广角——优化', '总复习'];
const M4D = ['四则运算', '观察物体（二）', '运算定律', '小数的意义和性质', '三角形', '小数的加法和减法', '图形的运动（二）', '平均数与条形统计图', '数学广角——鸡兔同笼', '总复习'];
const M5U = ['小数乘法', '位置', '小数除法', '可能性', '简易方程', '多边形的面积', '数学广角——植树问题', '总复习'];
const M5D = ['观察物体（三）', '因数与倍数', '长方体和正方体', '分数的意义和性质', '图形的运动（三）', '分数的加法和减法', '折线统计图', '数学广角——找次品', '总复习'];
const M6U = ['分数乘法', '位置与方向（二）', '分数除法', '比', '圆', '百分数（一）', '扇形统计图', '数学广角——数与形', '总复习'];
const M6D = ['负数', '百分数（二）', '圆柱与圆锥', '比例', '数学广角——鸽巢问题', '整理和复习'];

// ---- 英语（PEP 三年级起点，3-6 年级）----
const E3U = ['Unit 1 Hello!', 'Unit 2 Colours', 'Unit 3 Look at me!', 'Recycle 1', 'Unit 4 We love animals', "Unit 5 Let's eat!", 'Unit 6 Happy birthday!', 'Recycle 2'];
const E3D = ['Unit 1 Welcome back to school!', 'Unit 2 My family', 'Unit 3 At the zoo', 'Recycle 1', 'Unit 4 Where is my car?', 'Unit 5 Do you like pears?', 'Unit 6 How many?', 'Recycle 2'];
const E4U = ['Unit 1 My classroom', 'Unit 2 My schoolbag', 'Unit 3 My friends', 'Recycle 1', 'Unit 4 My home', "Unit 5 Dinner's ready", 'Unit 6 Meet my family!', 'Recycle 2'];
const E4D = ['Unit 1 My school', 'Unit 2 What time is it?', 'Unit 3 Weather', 'Recycle 1', 'Unit 4 At the farm', 'Unit 5 My clothes', 'Unit 6 Shopping', 'Recycle 2'];
const E5U = ["Unit 1 What's he like?", 'Unit 2 My week', 'Unit 3 What would you like?', 'Recycle 1', 'Unit 4 What can you do?', 'Unit 5 There is a big bed', 'Unit 6 In a nature park', 'Recycle 2'];
const E5D = ['Unit 1 My day', 'Unit 2 My favourite season', 'Unit 3 My school calendar', 'Recycle 1', 'Unit 4 When is the art show?', "Unit 5 Whose dog is it?", 'Unit 6 Work quietly!', 'Recycle 2'];
const E6U = ['Unit 1 How can I get there?', 'Unit 2 Ways to go to school', 'Unit 3 My weekend plan', 'Recycle 1', 'Unit 4 I have a pen pal', 'Unit 5 What does he do?', 'Unit 6 How do you feel?', 'Recycle 2'];
const E6D = ['Unit 1 How tall are you?', 'Unit 2 Last weekend', 'Unit 3 Where did you go?', 'Recycle 1', 'Unit 4 Then and now', 'Recycle 2'];

// ---- 道德与法治（统编，人教版出版；小学各册 4 单元）----
const D1U = ['我是小学生啦', '校园生活真快乐', '家中的安全与健康', '天气虽冷有温暖'];
const D1D = ['我们爱整洁', '我们有精神', '我不拖拉', '不做“小马虎”', '风儿轻轻吹', '花儿草儿真美丽', '可爱的动物', '大自然，谢谢您', '我和我的家', '家人的爱', '让我自己来整理', '干点家务活', '我想和你们一起玩', '请帮我一下吧', '分享真快乐', '大家一起真快乐'];
const D2U = ['我们的节假日', '我们的班级', '我们在公共场所', '我们生活的地方'];
const D2D = ['让我试试看', '我们好好玩', '绿色小卫士', '我会努力的'];
const D3U = ['快乐学习', '我们的学校', '安全护我成长', '家是最温暖的地方'];
const D3D = ['我和我的同伴', '我在这里长大', '交通出行有学问', '多样的交通与生活'];
const D4U = ['与班级共成长', '为父母分担', '信息万花筒', '让生活多一些绿色'];
const D4D = ['同伴与交往', '做聪明的消费者', '美好生活哪里来', '感受家乡文化，关心家乡发展'];
const D5U = ['面对成长中的新问题', '我们是班级的主人', '我们的国土，我们的家园', '骄人祖先，灿烂文化'];
const D5D = ['完善自我，健康成长', '公共生活靠大家', '百年追梦，复兴中华', '我们共同的世界'];
const D6U = ['我们的守护者', '我们是公民', '我们的国家机构', '法律保护我们健康成长'];
const D6D = ['完善自我，健康成长', '爱护地球，共同责任', '多样文明，多彩生活', '让世界更美好'];

// ---- 科学（人教版 2017 课标）----
const S1U = ['我们周围的物体', '比较与测量'];
const S1D = ['我们周围的植物', '动物'];
const S2U = ['我们的地球家园', '材料'];
const S2D = ['磁铁', '我们自己'];
const S3U = ['水', '空气', '天气'];
const S3D = ['物体的运动', '动物的一生', '太阳、地球和月球'];
const S4U = ['声音', '呼吸与消化', '运动和力'];
const S4D = ['植物的生长变化', '电路', '岩石与土壤'];
const S5U = ['光', '地球表面的变化', '计量时间', '健康生活'];
const S5D = ['生物与环境', '船的研究', '环境与我们'];
const S6U = ['微小世界', '地球的运动', '工具与技术'];
const S6D = ['物质的变化', '生物的多样性', '宇宙', '生命系统的组成'];

// ================= 初中（7-9 年级） =================
// ---- 数学（2024 新版七年级；八年级沿用旧章号）----
const JM7U = ['第一章 有理数', '第二章 有理数的运算', '第三章 代数式', '第四章 整式的加减', '第五章 一元一次方程', '第六章 几何图形初步'];
const JM7D = ['第五章 相交线与平行线', '第六章 实数', '第七章 平面直角坐标系', '第八章 二元一次方程组', '第九章 不等式与不等式组', '第十章 数据的收集、整理与描述'];
const JM8U = ['第十一章 三角形', '第十二章 全等三角形', '第十三章 轴对称', '第十四章 整式的乘法与因式分解', '第十五章 分式'];
const JM8D = ['第十六章 二次根式', '第十七章 勾股定理', '第十八章 平行四边形', '第十九章 一次函数', '第二十章 数据的分析'];
const JM9U = ['第二十一章 一元二次方程', '第二十二章 二次函数', '第二十三章 旋转', '第二十四章 圆', '第二十五章 概率初步'];
const JM9D = ['第二十六章 反比例函数', '第二十七章 相似', '第二十八章 锐角三角函数', '第二十九章 投影与视图'];

// ---- 英语（Go for it!；2024 新版七年级上册，其余现行版）----
const JE7U = ['Starter Unit 1 Hello!', 'Starter Unit 2 Keep Tidy!', 'Starter Unit 3 Welcome!', 'Unit 1 You and Me', "Unit 2 We're Family!", 'Unit 3 My School', 'Unit 4 My Favourite Subject', 'Unit 5 Fun Clubs', 'Unit 6 A Day in the Life'];
const JE7D = ['Unit 1 Can you play the guitar?', 'Unit 2 What time do you go to school?', 'Unit 3 How do you get to school?', "Unit 4 Don't eat in class.", 'Unit 5 Why do you like pandas?', "Unit 6 I'm watching TV.", "Unit 7 It's raining!", 'Unit 8 Is there a post office near here?', 'Unit 9 What does he look like?', "Unit 10 I'd like some noodles.", 'Unit 11 How was your school trip?', 'Unit 12 What did you do last weekend?'];
const JE8U = ['Unit 1 Where did you go on vacation?', 'Unit 2 How often do you exercise?', "Unit 3 I'm more outgoing than my sister.", "Unit 4 What's the best movie theater?", 'Unit 5 Do you want to watch a game show?', "Unit 6 I'm going to study computer science.", 'Unit 7 Will people have robots?', 'Unit 8 How do you make a banana milk shake?', 'Unit 9 Can you come to my party?', "Unit 10 If you go to the party, we'll have a great time!"];
const JE8D = ["Unit 1 What's the matter?", "Unit 2 I'll help to clean up the city parks.", 'Unit 3 Could you please clean your room?', "Unit 4 Why don't you talk to your parents?", 'Unit 5 What were you doing when the rainstorm came?', 'Unit 6 An old man tried to move the mountains.', "Unit 7 What's the highest mountain in the world?", 'Unit 8 Have you read Treasure Island yet?', 'Unit 9 Have you ever been to a museum?', "Unit 10 I've had this bike for three years."];
const JE9 = ['Unit 1 How can we become good learners?', 'Unit 2 I think that mooncakes are delicious!', 'Unit 3 Could you please tell me where the restrooms are?', "Unit 4 I used to be afraid of the dark.", "Unit 5 What are the shirts made of?", 'Unit 6 When was it invented?', 'Unit 7 Teenagers should be allowed to choose their own clothes.', 'Unit 8 It must belong to Carla.', 'Unit 9 I like music that I can dance to.', 'Unit 10 You are supposed to shake hands.', 'Unit 11 Sad movies make me cry.', 'Unit 12 Life is full of the unexpected.', "Unit 13 We're trying to save the earth!", 'Unit 14 I remember meeting all of you in Grade 7.'];

// ---- 语文（统编，初中各册 6 单元）----
const CJYW = (desc) => ({ description: desc, units: Array.from({ length: 6 }, (_, i) => u(i + 1, `第${'一二三四五六'[i]}单元`)) });

// ---- 物理（八上/八下/九全）----
const P8U = ['第一章 机械运动', '第二章 声现象', '第三章 物态变化', '第四章 光现象', '第五章 透镜及其应用', '第六章 质量与密度'];
const P8D = ['第七章 力', '第八章 运动和力', '第九章 压强', '第十章 浮力', '第十一章 功和机械能', '第十二章 简单机械'];
const P9 = ['第十三章 内能', '第十四章 内能的利用', '第十五章 电流和电路', '第十六章 电压 电阻', '第十七章 欧姆定律', '第十八章 电功率', '第十九章 生活用电', '第二十章 电与磁', '第二十一章 信息的传递', '第二十二章 能源与可持续发展'];

// ---- 化学（九上/九下）----
const C9U = ['第一单元 走进化学世界', '第二单元 我们周围的空气', '第三单元 物质构成的奥秘', '第四单元 自然界的水', '第五单元 化学方程式', '第六单元 碳和碳的氧化物', '第七单元 燃料及其利用'];
const C9D = ['第八单元 金属和金属材料', '第九单元 溶液', '第十单元 酸和碱', '第十一单元 盐 化肥', '第十二单元 化学与生活'];

// ---- 生物（七上~八下）----
const B7U = ['第一单元 生物和生物圈', '第二单元 生物体的结构层次', '第三单元 生物圈中的绿色植物'];
const B7D = ['第四单元 生物圈中的人'];
const B8U = ['第五单元 生物圈中的其他生物', '第六单元 生物的多样性及其保护'];
const B8D = ['第七单元 生物圈中生命的延续和发展', '第八单元 健康地生活'];

// ---- 道德与法治（统编，初中各册 4 单元）----
const D7U = ['第一单元 成长的节拍', '第二单元 友谊的天空', '第三单元 师长情谊', '第四单元 生命的思考'];
const D7D = ['第一单元 青春时光', '第二单元 做情绪情感的主人', '第三单元 在集体中成长', '第四单元 走进法治天地'];
const D8U = ['第一单元 走进社会生活', '第二单元 遵守社会规则', '第三单元 勇担社会责任', '第四单元 维护国家利益'];
const D8D = ['第一单元 坚持宪法至上', '第二单元 理解权利义务', '第三单元 人民当家作主', '第四单元 崇尚法治精神'];
const D9U = ['第一单元 富强与创新', '第二单元 民主与法治', '第三单元 文明与家园', '第四单元 和谐与梦想'];
const D9D = ['第一单元 我们共同的世界', '第二单元 世界舞台上的中国', '第三单元 走向未来的少年'];

// ---- 历史（统编，初中各册）----
const H7U = ['第一单元 史前时期：中国境内早期人类与文明的起源', '第二单元 夏商周时期：早期国家与社会变革', '第三单元 秦汉时期：统一多民族国家的建立和巩固', '第四单元 三国两晋南北朝时期：政权分立与民族交融', '第五单元 隋唐时期：繁荣与开放的时代', '第六单元 辽宋夏金元时期：民族关系发展和社会变化', '第七单元 明清时期：统一多民族国家的巩固与发展'];
const H7D = ['第一单元 隋唐时期：繁荣与开放的时代', '第二单元 辽宋夏金元时期：民族关系发展和社会变化', '第三单元 明清时期：统一多民族国家的巩固与发展'];
const H8U = ['第一单元 中国开始沦为半殖民地半封建社会', '第二单元 近代化的早期探索与民族危机的加剧', '第三单元 资产阶级民主革命与中华民国的建立', '第四单元 新民主主义革命的开始', '第五单元 从国共合作到国共对立', '第六单元 中华民族的抗日战争', '第七单元 人民解放战争', '第八单元 近代经济、社会生活与教育文化事业的发展'];
const H8D = ['第一单元 中华人民共和国的成立和巩固', '第二单元 社会主义制度的建立与社会主义建设的探索', '第三单元 中国特色社会主义道路', '第四单元 民族团结与祖国统一', '第五单元 国防建设与外交成就', '第六单元 科技文化与社会生活'];
const H9U = ['第一单元 古代亚非文明', '第二单元 古代欧洲文明', '第三单元 封建时代的欧洲', '第四单元 封建时代的亚洲国家', '第五单元 走向近代', '第六单元 资本主义制度的初步确立', '第七单元 工业革命和国际共产主义运动的兴起'];
const H9D = ['第一单元 殖民地人民的反抗与资本主义制度的扩展', '第二单元 第二次工业革命和近代科学文化', '第三单元 第一次世界大战和战后初期的世界', '第四单元 经济大危机和第二次世界大战', '第五单元 冷战和美苏对峙的世界', '第六单元 冷战结束后的世界'];

// ---- 地理（七上~八下）----
const G7U = ['第一章 地球和地图', '第二章 陆地和海洋', '第三章 天气与气候', '第四章 居民与聚落', '第五章 发展与合作'];
const G7D = ['第六章 我们生活的大洲——亚洲', '第七章 我们邻近的地区和国家', '第八章 东半球其他的地区和国家', '第九章 西半球的国家', '第十章 极地地区'];
const G8U = ['第一章 从世界看中国', '第二章 中国的自然环境', '第三章 中国的自然资源', '第四章 中国的经济发展'];
const G8D = ['第五章 中国的地理差异', '第六章 北方地区', '第七章 南方地区', '第八章 西北地区', '第九章 青藏地区', '第十章 中国在世界中'];

// ================= 组装 =================
const GRADES_PRIMARY = ['1', '2', '3', '4', '5', '6'];
const GRADES_JUNIOR = ['7', '8', '9'];
const TERMS = ['UP', 'DOWN'];

export const PEP_TEXTBOOKS = [];

// 小学语文（统编）：8 单元/册
for (const g of GRADES_PRIMARY) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '语文', version: '人教版', grade: g, term: t,
      description: `统编版小学语文${g}年级${t === 'UP' ? '上' : '下'}册（教育部组织编写、人民教育出版社出版），按识字、拼音、课文与阅读主题编排，全册 8 个单元。`,
      units: XXYW('').units,
    });
  }
}

// 小学数学（人教版）
const MATH_PRIMARY = { '1': { UP: M1U, DOWN: M1D }, '2': { UP: M2U, DOWN: M2D }, '3': { UP: M3U, DOWN: M3D }, '4': { UP: M4U, DOWN: M4D }, '5': { UP: M5U, DOWN: M5D }, '6': { UP: M6U, DOWN: M6D } };
for (const g of GRADES_PRIMARY) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '数学', version: '人教版', grade: g, term: t,
      description: `人教版小学数学${g}年级${t === 'UP' ? '上' : '下'}册（课程教材研究所编著），数与代数、图形与几何、统计与概率、综合实践四大领域。`,
      units: units(MATH_PRIMARY[g][t]),
    });
  }
}

// 小学英语 PEP（三年级起点，3-6 年级）
const PEP_ENG = { '3': { UP: E3U, DOWN: E3D }, '4': { UP: E4U, DOWN: E4D }, '5': { UP: E5U, DOWN: E5D }, '6': { UP: E6U, DOWN: E6D } };
for (const g of ['3', '4', '5', '6']) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '英语', version: '人教版', grade: g, term: t,
      description: `人教版（PEP）小学英语${g}年级${t === 'UP' ? '上' : '下'}册（三年级起点），每册 6 个主单元 + 2 个复习单元，话题式编排。`,
      units: units(PEP_ENG[g][t]),
    });
  }
}

// 小学道德与法治（统编）
const PEP_DD = { '1': { UP: D1U, DOWN: D1D }, '2': { UP: D2U, DOWN: D2D }, '3': { UP: D3U, DOWN: D3D }, '4': { UP: D4U, DOWN: D4D }, '5': { UP: D5U, DOWN: D5D }, '6': { UP: D6U, DOWN: D6D } };
for (const g of GRADES_PRIMARY) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '道德与法治', version: '人教版', grade: g, term: t,
      description: `统编版小学道德与法治${g}年级${t === 'UP' ? '上' : '下'}册（人民教育出版社出版），围绕个人、家庭、学校、社会、国家与自然展开。`,
      units: units(PEP_DD[g][t]),
    });
  }
}

// 小学科学（人教版 2017 课标）
const PEP_SCI = { '1': { UP: S1U, DOWN: S1D }, '2': { UP: S2U, DOWN: S2D }, '3': { UP: S3U, DOWN: S3D }, '4': { UP: S4U, DOWN: S4D }, '5': { UP: S5U, DOWN: S5D }, '6': { UP: S6U, DOWN: S6D } };
for (const g of GRADES_PRIMARY) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '科学', version: '人教版', grade: g, term: t,
      description: `人教版小学科学${g}年级${t === 'UP' ? '上' : '下'}册（2017 年版课程标准），物质科学、生命科学、地球与宇宙、技术与工程四大领域。`,
      units: units(PEP_SCI[g][t]),
    });
  }
}

// 小学音体美（教材壳，无严格单元）
for (const g of GRADES_PRIMARY) {
  for (const t of TERMS) {
    for (const subj of ['音乐', '美术', '体育与健康']) {
      PEP_TEXTBOOKS.push({
        subject: subj, version: '人教版', grade: g, term: t,
        description: `人教版小学${subj}${g}年级${t === 'UP' ? '上' : '下'}册（课程教材研究所编著），按课次编排，单元目录以实际教材为准。`,
        units: [],
      });
    }
  }
}

// ---- 初中 ----
// 数学
const JUNIOR_MATH = { '7': { UP: JM7U, DOWN: JM7D }, '8': { UP: JM8U, DOWN: JM8D }, '9': { UP: JM9U, DOWN: JM9D } };
for (const g of GRADES_JUNIOR) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '数学', version: '人教版', grade: g, term: t,
      description: `人教版初中数学${g}年级${t === 'UP' ? '上' : '下'}册${g === '7' ? '（2022 版课标新教材）' : ''}，数与代数、图形与几何、统计与概率、综合与实践。`,
      units: units(JUNIOR_MATH[g][t]),
    });
  }
}

// 英语（Go for it!）
PEP_TEXTBOOKS.push({ subject: '英语', version: '人教版', grade: '7', term: 'UP', description: '人教版（Go for it!）七年级上册（2022 版课标新教材），Starter 单元 + 6 个话题单元。', units: units(JE7U) });
PEP_TEXTBOOKS.push({ subject: '英语', version: '人教版', grade: '7', term: 'DOWN', description: '人教版（Go for it!）七年级下册，12 个话题单元，强化现在进行时、一般过去时等语法。', units: units(JE7D) });
PEP_TEXTBOOKS.push({ subject: '英语', version: '人教版', grade: '8', term: 'UP', description: '人教版（Go for it!）八年级上册，围绕假期经历、频率表达、比较级、未来计划等话题。', units: units(JE8U) });
PEP_TEXTBOOKS.push({ subject: '英语', version: '人教版', grade: '8', term: 'DOWN', description: '人教版（Go for it!）八年级下册，健康建议、志愿服务、家务请求、故事阅读等话题，强化情态动词、现在完成时。', units: units(JE8D) });
PEP_TEXTBOOKS.push({ subject: '英语', version: '人教版', grade: '9', term: 'UP', description: '人教版（Go for it!）九年级全一册，14 个话题单元，初中英语综合提升与备考。', units: units(JE9) });

// 语文（统编）
for (const g of GRADES_JUNIOR) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '语文', version: '人教版', grade: g, term: t,
      description: `统编版初中语文${g}年级${t === 'UP' ? '上' : '下'}册（人民教育出版社出版），阅读、写作、综合性学习与名著导读，全册 6 个单元。`,
      units: CJYW('').units,
    });
  }
}

// 物理 / 化学 / 生物
PEP_TEXTBOOKS.push({ subject: '物理', version: '人教版', grade: '8', term: 'UP', description: '人教版八年级上册物理（机械运动→质量与密度）。', units: units(P8U) });
PEP_TEXTBOOKS.push({ subject: '物理', version: '人教版', grade: '8', term: 'DOWN', description: '人教版八年级下册物理（力→简单机械）。', units: units(P8D) });
PEP_TEXTBOOKS.push({ subject: '物理', version: '人教版', grade: '9', term: 'UP', description: '人教版九年级全一册物理（内能→能源与可持续发展）。', units: units(P9) });
PEP_TEXTBOOKS.push({ subject: '化学', version: '人教版', grade: '9', term: 'UP', description: '人教版九年级上册化学（走进化学世界→燃料及其利用）。', units: units(C9U) });
PEP_TEXTBOOKS.push({ subject: '化学', version: '人教版', grade: '9', term: 'DOWN', description: '人教版九年级下册化学（金属和金属材料→化学与生活）。', units: units(C9D) });
PEP_TEXTBOOKS.push({ subject: '生物', version: '人教版', grade: '7', term: 'UP', description: '人教版七年级上册生物（生物和生物圈→生物圈中的绿色植物）。', units: units(B7U) });
PEP_TEXTBOOKS.push({ subject: '生物', version: '人教版', grade: '7', term: 'DOWN', description: '人教版七年级下册生物（生物圈中的人）。', units: units(B7D) });
PEP_TEXTBOOKS.push({ subject: '生物', version: '人教版', grade: '8', term: 'UP', description: '人教版八年级上册生物（生物圈中的其他生物、生物的多样性及其保护）。', units: units(B8U) });
PEP_TEXTBOOKS.push({ subject: '生物', version: '人教版', grade: '8', term: 'DOWN', description: '人教版八年级下册生物（生物圈中生命的延续和发展、健康地生活）。', units: units(B8D) });

// 道德与法治（统编）
const JUNIOR_DD = { '7': { UP: D7U, DOWN: D7D }, '8': { UP: D8U, DOWN: D8D }, '9': { UP: D9U, DOWN: D9D } };
for (const g of GRADES_JUNIOR) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '道德与法治', version: '人教版', grade: g, term: t,
      description: `统编版初中道德与法治${g}年级${t === 'UP' ? '上' : '下'}册（人民教育出版社出版），4 个单元。`,
      units: units(JUNIOR_DD[g][t]),
    });
  }
}

// 历史（统编）
const JUNIOR_HIS = { '7': { UP: H7U, DOWN: H7D }, '8': { UP: H8U, DOWN: H8D }, '9': { UP: H9U, DOWN: H9D } };
for (const g of GRADES_JUNIOR) {
  for (const t of TERMS) {
    PEP_TEXTBOOKS.push({
      subject: '历史', version: '人教版', grade: g, term: t,
      description: `统编版初中历史${g}年级${t === 'UP' ? '上' : '下'}册（人民教育出版社出版），按时序通史编排。`,
      units: units(JUNIOR_HIS[g][t]),
    });
  }
}

// 地理（七上~八下）
PEP_TEXTBOOKS.push({ subject: '地理', version: '人教版', grade: '7', term: 'UP', description: '人教版七年级上册地理（地球和地图→发展与合作）。', units: units(G7U) });
PEP_TEXTBOOKS.push({ subject: '地理', version: '人教版', grade: '7', term: 'DOWN', description: '人教版七年级下册地理（世界区域地理）。', units: units(G7D) });
PEP_TEXTBOOKS.push({ subject: '地理', version: '人教版', grade: '8', term: 'UP', description: '人教版八年级上册地理（中国地理总论）。', units: units(G8U) });
PEP_TEXTBOOKS.push({ subject: '地理', version: '人教版', grade: '8', term: 'DOWN', description: '人教版八年级下册地理（中国区域地理）。', units: units(G8D) });

// 初中音体美（教材壳）
for (const g of GRADES_JUNIOR) {
  for (const t of TERMS) {
    for (const subj of ['音乐', '美术', '体育与健康']) {
      PEP_TEXTBOOKS.push({
        subject: subj, version: '人教版', grade: g, term: t,
        description: `人教版初中${subj}${g}年级${t === 'UP' ? '上' : '下'}册（课程教材研究所编著），按课次编排，单元目录以实际教材为准。`,
        units: [],
      });
    }
  }
}

// ================= 高中（必修 + 选择性必修，2019 课标） =================
// grade 约定：10=高一 11=高二 12=高三；term 按册序 UP/DOWN 近似映射（教材名精确）

// 语文（统编）
const H_CHINESE = [
  { name: '语文', grade: '10', term: 'UP', title: '必修上册', units: ['第一单元', '第二单元', '第三单元', '第四单元', '第五单元', '第六单元', '第七单元', '第八单元'] },
  { name: '语文', grade: '10', term: 'DOWN', title: '必修下册', units: ['第一单元', '第二单元', '第三单元', '第四单元', '第五单元', '第六单元', '第七单元', '第八单元'] },
  { name: '语文', grade: '11', term: 'UP', title: '选择性必修上册', units: ['第一单元', '第二单元', '第三单元', '第四单元'] },
  { name: '语文', grade: '11', term: 'DOWN', title: '选择性必修中册', units: ['第一单元', '第二单元', '第三单元', '第四单元'] },
  { name: '语文', grade: '12', term: 'UP', title: '选择性必修下册', units: ['第一单元', '第二单元', '第三单元', '第四单元'] },
];

// 数学（A版）
const H_MATH = [
  { name: '数学', grade: '10', term: 'UP', title: '必修第一册', units: ['第一章 集合与常用逻辑用语', '第二章 一元二次函数、方程和不等式', '第三章 函数的概念与性质', '第四章 指数函数与对数函数', '第五章 三角函数'] },
  { name: '数学', grade: '10', term: 'DOWN', title: '必修第二册', units: ['第六章 平面向量及其应用', '第七章 复数', '第八章 立体几何初步', '第九章 统计', '第十章 概率'] },
  { name: '数学', grade: '11', term: 'UP', title: '选择性必修第一册', units: ['第一章 空间向量与立体几何', '第二章 直线和圆的方程', '第三章 圆锥曲线的方程'] },
  { name: '数学', grade: '11', term: 'DOWN', title: '选择性必修第二册', units: ['第四章 数列', '第五章 一元函数的导数及其应用'] },
  { name: '数学', grade: '12', term: 'UP', title: '选择性必修第三册', units: ['第六章 计数原理', '第七章 随机变量及其分布', '第八章 成对数据的统计分析'] },
];

// 英语（2019 新教材）
const H_ENGLISH = [
  { name: '英语', grade: '10', term: 'UP', title: '必修第一册', units: ['Unit 1 Teenage Life', 'Unit 2 Travelling Around', 'Unit 3 Sports and Fitness', 'Unit 4 Natural Disasters', 'Unit 5 Languages Around the World'] },
  { name: '英语', grade: '10', term: 'DOWN', title: '必修第二册', units: ['Unit 1 Cultural Heritage', 'Unit 2 Wildlife Protection', 'Unit 3 The Internet', 'Unit 4 History and Traditions', 'Unit 5 Music'] },
  { name: '英语', grade: '11', term: 'UP', title: '必修第三册', units: ['Unit 1 Festivals and Celebrations', 'Unit 2 Morals and Virtues', 'Unit 3 Diverse Cultures', 'Unit 4 Space Exploration', 'Unit 5 The Value of Money'] },
  { name: '英语', grade: '11', term: 'DOWN', title: '选择性必修第一册', units: ['Unit 1 People of Achievement', 'Unit 2 Looking into the Future', 'Unit 3 Fascinating Parks', 'Unit 4 Body Language', 'Unit 5 Working the Land'] },
  { name: '英语', grade: '12', term: 'UP', title: '选择性必修第二册', units: ['Unit 1 Science and Scientists', 'Unit 2 Bridging Cultures', 'Unit 3 Food and Culture', 'Unit 4 Journey Across a Vast Land', 'Unit 5 First Aid'] },
  { name: '英语', grade: '12', term: 'DOWN', title: '选择性必修第三册', units: ['Unit 1 Art', 'Unit 2 Healthy Lifestyle', 'Unit 3 Environmental Protection', 'Unit 4 Adversity and Courage', 'Unit 5 Poems'] },
  { name: '英语', grade: '12', term: 'UP', title: '选择性必修第四册', units: ['Unit 1 Science Fiction', 'Unit 2 Iconic Attractions', 'Unit 3 Sea Exploration', 'Unit 4 Sharing', 'Unit 5 Launching Your Career'] },
];

// 物理（2019）
const H_PHYSICS = [
  { name: '物理', grade: '10', term: 'UP', title: '必修第一册', units: ['第一章 运动的描述', '第二章 匀变速直线运动的研究', '第三章 相互作用——力', '第四章 运动和力的关系'] },
  { name: '物理', grade: '10', term: 'DOWN', title: '必修第二册', units: ['第五章 抛体运动', '第六章 圆周运动', '第七章 万有引力与宇宙航行', '第八章 机械能守恒定律'] },
  { name: '物理', grade: '11', term: 'UP', title: '必修第三册', units: ['第九章 静电场及其应用', '第十章 静电场中的能量', '第十一章 电路及其应用', '第十二章 电能 能量守恒定律', '第十三章 电磁感应与电磁波初步'] },
  { name: '物理', grade: '11', term: 'DOWN', title: '选择性必修第一册', units: ['第一章 动量守恒定律', '第二章 机械振动', '第三章 机械波', '第四章 光'] },
  { name: '物理', grade: '12', term: 'UP', title: '选择性必修第二册', units: ['第一章 安培力与洛伦兹力', '第二章 电磁感应', '第三章 交变电流', '第四章 电磁振荡与电磁波', '第五章 传感器'] },
  { name: '物理', grade: '12', term: 'DOWN', title: '选择性必修第三册', units: ['第一章 分子动理论', '第二章 气体、固体和液体', '第三章 热力学定律', '第四章 原子结构和波粒二象性', '第五章 原子核'] },
];

// 化学（2019）
const H_CHEMISTRY = [
  { name: '化学', grade: '10', term: 'UP', title: '必修第一册', units: ['第一章 物质及其变化', '第二章 海水中的重要元素——钠和氯', '第三章 铁 金属材料', '第四章 物质的量'] },
  { name: '化学', grade: '10', term: 'DOWN', title: '必修第二册', units: ['第五章 化工生产中的重要非金属元素', '第六章 化学反应与能量', '第七章 有机化合物', '第八章 化学与可持续发展'] },
  { name: '化学', grade: '11', term: 'UP', title: '选择性必修1 化学反应原理', units: ['第一章 化学反应的热效应', '第二章 化学反应速率与化学平衡', '第三章 水溶液中的离子反应与平衡', '第四章 化学反应与电能'] },
  { name: '化学', grade: '11', term: 'DOWN', title: '选择性必修2 物质结构与性质', units: ['第一章 原子结构与性质', '第二章 分子结构与性质', '第三章 晶体结构与性质'] },
  { name: '化学', grade: '12', term: 'UP', title: '选择性必修3 有机化学基础', units: ['第一章 有机化合物的结构特点与研究方法', '第二章 烃', '第三章 烃的衍生物', '第四章 生物大分子', '第五章 合成高分子'] },
];

// 生物（2019）
const H_BIOLOGY = [
  { name: '生物', grade: '10', term: 'UP', title: '必修1 分子与细胞', units: ['第1章 走近细胞', '第2章 组成细胞的分子', '第3章 细胞的基本结构', '第4章 细胞的物质输入和输出', '第5章 细胞的能量供应和利用', '第6章 细胞的生命历程'] },
  { name: '生物', grade: '10', term: 'DOWN', title: '必修2 遗传与进化', units: ['第1章 遗传因子的发现', '第2章 基因和染色体的关系', '第3章 基因的本质', '第4章 基因的表达', '第5章 基因突变及其他变异', '第6章 生物的进化'] },
  { name: '生物', grade: '11', term: 'UP', title: '选择性必修1 稳态与调节', units: ['第1章 人体的内环境与稳态', '第2章 神经调节', '第3章 体液调节', '第4章 免疫调节', '第5章 植物生命活动的调节'] },
  { name: '生物', grade: '11', term: 'DOWN', title: '选择性必修2 生物与环境', units: ['第1章 种群及其动态', '第2章 群落及其演替', '第3章 生态系统及其稳定性', '第4章 人与环境'] },
  { name: '生物', grade: '12', term: 'UP', title: '选择性必修3 生物技术与工程', units: ['第1章 发酵工程', '第2章 细胞工程', '第3章 基因工程', '第4章 生物技术的安全性与伦理问题'] },
];

// 政治（统编）
const H_POLITICS = [
  { name: '政治', grade: '10', term: 'UP', title: '必修1 中国特色社会主义', units: ['第一课 社会主义从空想到科学、从理论到实践的发展', '第二课 只有社会主义才能救中国', '第三课 只有中国特色社会主义才能发展中国', '第四课 只有坚持和发展中国特色社会主义才能实现中华民族伟大复兴'] },
  { name: '政治', grade: '10', term: 'DOWN', title: '必修2 经济与社会', units: ['第一课 我国的生产资料所有制', '第二课 我国的社会主义市场经济体制', '第三课 我国的经济发展', '第四课 我国的个人收入分配与社会保障'] },
  { name: '政治', grade: '11', term: 'UP', title: '必修3 政治与法治', units: ['第一单元 中国共产党的领导', '第二单元 人民当家作主', '第三单元 全面依法治国'] },
  { name: '政治', grade: '11', term: 'DOWN', title: '必修4 哲学与文化', units: ['第一单元 探索世界与把握规律', '第二单元 认识社会与价值选择', '第三单元 文化传承与文化创新'] },
  { name: '政治', grade: '12', term: 'UP', title: '选择性必修1 当代国际政治与经济', units: ['第一单元 各具特色的国家与国际组织', '第二单元 世界多极化', '第三单元 经济全球化', '第四单元 国际组织'] },
  { name: '政治', grade: '12', term: 'DOWN', title: '选择性必修2 法律与生活', units: ['第一单元 民事权利与义务', '第二单元 家庭与婚姻', '第三单元 就业与创业', '第四单元 社会争议解决'] },
  { name: '政治', grade: '12', term: 'UP', title: '选择性必修3 逻辑与思维', units: ['第一单元 把握逻辑要义', '第二单元 遵循逻辑思维规则', '第三单元 运用辩证思维方法', '第四单元 提高创新思维能力'] },
];

// 历史（统编）
const H_HISTORY = [
  { name: '历史', grade: '10', term: 'UP', title: '必修上册（中外历史纲要·上）', units: ['第一单元 从中华文明起源到秦汉统一多民族封建国家的建立与巩固', '第二单元 三国两晋南北朝的民族交融与隋唐统一多民族封建国家的发展', '第三单元 辽宋夏金多民族政权的并立与元朝的统一', '第四单元 明清中国版图的奠定与面临的挑战', '第五单元 晚清时期的内忧外患与救亡图存', '第六单元 辛亥革命与中华民国的建立', '第七单元 中国共产党成立与新民主主义革命兴起', '第八单元 中华民族的抗日战争和人民解放战争', '第九单元 中华人民共和国成立和社会主义革命与建设', '第十单元 改革开放与社会主义现代化建设新时期'] },
  { name: '历史', grade: '10', term: 'DOWN', title: '必修下册（中外历史纲要·下）', units: ['第一单元 古代文明的产生与发展', '第二单元 中古时期的世界', '第三单元 走向整体的世界', '第四单元 资本主义制度的确立', '第五单元 工业革命与马克思主义的诞生', '第六单元 世界殖民体系与亚非拉民族独立运动', '第七单元 两次世界大战、十月革命与国际秩序的演变', '第八单元 20世纪下半叶世界的新变化', '第九单元 当代世界发展的特点与主要趋势'] },
  { name: '历史', grade: '11', term: 'UP', title: '选择性必修1 国家制度与社会治理', units: ['第一单元 政治制度', '第二单元 官员的选拔与管理', '第三单元 法律与教化', '第四单元 民族关系与国家关系', '第五单元 货币与税收', '第六单元 基层治理与社会保障'] },
  { name: '历史', grade: '11', term: 'DOWN', title: '选择性必修2 经济与社会生活', units: ['第一单元 食物生产与社会生活', '第二单元 生产工具与劳作方式', '第三单元 商业贸易与日常生活', '第四单元 村落、城镇与居住环境', '第五单元 交通与社会变迁', '第六单元 医疗与公共卫生'] },
  { name: '历史', grade: '12', term: 'UP', title: '选择性必修3 文化交流与传播', units: ['第一单元 源远流长的中华文化', '第二单元 丰富多样的世界文化', '第三单元 人口迁徙、文化交融与认同', '第四单元 商路、贸易与文化交流', '第五单元 战争与文化交锋', '第六单元 文化的传承与保护'] },
];

// 地理（2019）
const H_GEOGRAPHY = [
  { name: '地理', grade: '10', term: 'UP', title: '必修第一册', units: ['第一章 宇宙中的地球', '第二章 地球上的大气', '第三章 地球上的水', '第四章 地貌', '第五章 植被与土壤', '第六章 自然灾害'] },
  { name: '地理', grade: '10', term: 'DOWN', title: '必修第二册', units: ['第一章 人口', '第二章 乡村和城镇', '第三章 产业区位因素', '第四章 交通运输布局与区域发展', '第五章 环境与发展'] },
  { name: '地理', grade: '11', term: 'UP', title: '选择性必修1 自然地理基础', units: ['第一章 地球的运动', '第二章 地表形态的塑造', '第三章 大气的运动', '第四章 水的运动', '第五章 自然环境的整体性与差异性'] },
  { name: '地理', grade: '11', term: 'DOWN', title: '选择性必修2 区域发展', units: ['第一章 区域与区域发展', '第二章 资源、环境与区域发展', '第三章 城市、产业与区域发展', '第四章 区际联系与区域协调发展'] },
  { name: '地理', grade: '12', term: 'UP', title: '选择性必修3 资源、环境与国家安全', units: ['第一章 自然环境与人类社会', '第二章 资源安全与国家安全', '第三章 环境安全与国家安全', '第四章 保障国家安全的资源、环境战略与行动'] },
];

// 高中音体美（教材壳）
const H_SHELL = [
  { name: '音乐', grade: '10', term: 'UP', title: '必修·音乐鉴赏' },
  { name: '音乐', grade: '11', term: 'UP', title: '选择性必修·歌唱' },
  { name: '美术', grade: '10', term: 'UP', title: '必修·美术鉴赏' },
  { name: '体育与健康', grade: '10', term: 'UP', title: '必修全一册' },
];

const HIGH_SCHOOL_GROUPS = [H_CHINESE, H_MATH, H_ENGLISH, H_PHYSICS, H_CHEMISTRY, H_BIOLOGY, H_POLITICS, H_HISTORY, H_GEOGRAPHY];
for (const group of HIGH_SCHOOL_GROUPS) {
  for (const bk of group) {
    PEP_TEXTBOOKS.push({
      subject: bk.name, version: '人教版', grade: bk.grade, term: bk.term,
      description: `人教版高中${bk.name} ${bk.title}（2019 年版课程标准，人民教育出版社出版）。`,
      units: units(bk.units),
    });
  }
}
for (const bk of H_SHELL) {
  PEP_TEXTBOOKS.push({
    subject: bk.name, version: '人教版', grade: bk.grade, term: bk.term,
    description: `人教版高中${bk.name} ${bk.title}（2019 年版课程标准）。`,
    units: [],
  });
}
