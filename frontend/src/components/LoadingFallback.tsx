/**
 * 路由懒加载的加载中组件
 */
export function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">加载中...</p>
      </div>
    </div>
  );
}
