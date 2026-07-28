import React from 'react';

/**
 * Footer 组件 - 页面底部
 * 显示版权信息和链接
 */
interface FooterProps {
  copyright?: string;
  links?: Array<{ label: string; href: string }>;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  copyright = '© 2024 EduSmart. All rights reserved.',
  links = [],
  className = '',
}) => {
  return (
    <footer
      className={`
        border-t border-secondary-700 bg-secondary-900 px-4 py-6
        ${className}
      `}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-secondary-400 text-sm">{copyright}</p>
        {links.length > 0 && (
          <div className="flex gap-6">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-secondary-400 hover:text-white text-sm transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
};
