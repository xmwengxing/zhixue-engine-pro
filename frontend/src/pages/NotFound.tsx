import { Link } from 'react-router-dom';

/**
 * 404 页面
 */
export const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900">404</h1>
        <p className="mt-4 text-xl text-gray-600">页面不存在</p>
        <Link
          to="/"
          className="mt-6 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
};
