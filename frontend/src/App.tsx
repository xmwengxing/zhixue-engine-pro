import { RouterProvider } from 'react-router-dom';
import { router } from './router';

/**
 * 应用根组件
 * 提供路由配置
 */
function App() {
  return <RouterProvider router={router} />;
}

export default App;
