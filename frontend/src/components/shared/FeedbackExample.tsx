import React, { useState } from 'react';
import Modal from './Modal';
import { ToastContainer } from './Toast';
import { useToast } from '../../hooks/useToast';
import Loading, { Skeleton, LoadingDots, LoadingBar } from './Loading';
import Empty, {
  EmptySearch,
  EmptyList,
  EmptyError,
  EmptyNetwork,
  EmptyPermission,
} from './Empty';
import { Button } from './Button';

/**
 * 反馈组件使用示例
 * 展示 Modal、Toast、Loading、Empty 组件的使用方法
 */
const FeedbackExample: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emptyType, setEmptyType] = useState<string>('default');
  const { toasts, removeToast, success, error, warning, info } = useToast();

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">反馈组件示例</h1>

      {/* Toast 示例 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Toast 消息提示</h2>
        <div className="flex gap-3">
          <Button onClick={() => success('操作成功！')}>成功提示</Button>
          <Button onClick={() => error('操作失败，请重试')}>错误提示</Button>
          <Button onClick={() => warning('请注意检查输入')}>警告提示</Button>
          <Button onClick={() => info('这是一条信息提示')}>信息提示</Button>
        </div>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </section>

      {/* Modal 示例 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Modal 模态对话框</h2>
        <Button onClick={() => setIsModalOpen(true)}>打开模态框</Button>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="示例模态框"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                取消
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>确认</Button>
            </>
          }
        >
          <p className="text-gray-600">
            这是一个模态对话框的示例内容。您可以在这里放置任何需要的内容。
          </p>
        </Modal>
      </section>

      {/* Loading 示例 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Loading 加载指示器</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium mb-2">基础加载</h3>
            <div className="flex gap-4 items-center">
              <Loading size="sm" />
              <Loading size="md" />
              <Loading size="lg" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">带文字加载</h3>
            <Loading text="加载中..." />
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">加载点动画</h3>
            <div className="flex gap-4">
              <LoadingDots size="sm" />
              <LoadingDots size="md" />
              <LoadingDots size="lg" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">进度条</h3>
            <div className="space-y-2">
              <LoadingBar progress={30} />
              <LoadingBar progress={60} />
              <LoadingBar indeterminate />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">骨架屏</h3>
            <div className="space-y-2">
              <Skeleton variant="text" width="100%" height="20px" />
              <Skeleton variant="text" width="80%" height="20px" />
              <div className="flex gap-2">
                <Skeleton variant="circular" width="40px" height="40px" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="60%" height="16px" />
                  <Skeleton variant="text" width="40%" height="16px" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">全屏加载</h3>
            <Button
              onClick={() => {
                setIsLoading(true);
                setTimeout(() => setIsLoading(false), 2000);
              }}
            >
              显示全屏加载
            </Button>
            {isLoading && <Loading fullScreen text="加载中，请稍候..." />}
          </div>
        </div>
      </section>

      {/* Empty 示例 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800">Empty 空状态</h2>
        <div className="flex gap-2 mb-4">
          <Button onClick={() => setEmptyType('default')}>默认</Button>
          <Button onClick={() => setEmptyType('search')}>搜索为空</Button>
          <Button onClick={() => setEmptyType('list')}>列表为空</Button>
          <Button onClick={() => setEmptyType('error')}>加载错误</Button>
          <Button onClick={() => setEmptyType('network')}>网络错误</Button>
          <Button onClick={() => setEmptyType('permission')}>无权限</Button>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-white">
          {emptyType === 'default' && (
            <Empty
              title="暂无数据"
              description="这是一个默认的空状态示例"
            />
          )}
          {emptyType === 'search' && (
            <EmptySearch onReset={() => console.log('重置筛选')} />
          )}
          {emptyType === 'list' && (
            <EmptyList
              onCreate={() => console.log('创建')}
              createText="创建新项目"
            />
          )}
          {emptyType === 'error' && (
            <EmptyError onRetry={() => console.log('重试')} />
          )}
          {emptyType === 'network' && (
            <EmptyNetwork onRetry={() => console.log('重新连接')} />
          )}
          {emptyType === 'permission' && <EmptyPermission />}
        </div>
      </section>
    </div>
  );
};

export default FeedbackExample;
