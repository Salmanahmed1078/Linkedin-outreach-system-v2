'use client';

import Link from 'next/link';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  activeView?: string;
}

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
};

export default function Sidebar({ isCollapsed, onToggle, activeView = 'overview' }: SidebarProps) {

  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'posts',
      label: 'Posts',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'dms',
      label: 'All Leads',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'messages',
      label: 'Messages Approval',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
  ];

  const handleNavClick = (itemId: string) => {
    // Dispatch custom event to update view in DashboardClient
    const event = new CustomEvent('dashboard-nav', { detail: itemId });
    window.dispatchEvent(event);
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-slate-200 transition-all duration-300 z-40 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo Section */}
      <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">CW</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">ChatWalrus</span>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-lg">CW</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-5 h-5 text-slate-600 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors group ${
                activeView === item.id
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span
                className={`flex-shrink-0 ${
                  activeView === item.id
                    ? 'text-cyan-600'
                    : 'text-slate-500 group-hover:text-slate-700'
                }`}
              >
                {item.icon}
              </span>
              {!isCollapsed && (
                <span className="flex-1 text-left font-medium text-sm">{item.label}</span>
              )}
              {!isCollapsed && item.count !== undefined && (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                  activeView === item.id
                    ? 'bg-cyan-100 text-cyan-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-slate-200 p-4">
        {!isCollapsed && (
          <div className="mb-4">
            <div className="px-3 py-2 bg-gradient-to-r from-cyan-50 to-sky-50 rounded-lg border border-cyan-100">
              <p className="text-xs font-semibold text-cyan-900 mb-1">Need Help?</p>
              <p className="text-xs text-cyan-700">Check our documentation</p>
            </div>
          </div>
        )}
        <Link
          href="/"
          className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors group"
        >
          <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {!isCollapsed && <span className="text-sm font-medium">Back to Home</span>}
        </Link>
      </div>
    </aside>
  );
}

