import SubjectLearningStateView from '../../components/common/SubjectLearningStateView';

/**
 * 学员端 - 学科学情总览
 * 学员身份由 token 推导，直接查看本人各学科档案
 */
export default function SubjectLearningState() {
  return <SubjectLearningStateView role="student" />;
}
