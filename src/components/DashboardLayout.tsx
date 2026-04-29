import { Outlet, Link, useLocation } from 'react-router-dom';
import { Terminal, LayoutDashboard, PlusCircle, Activity, Settings, User } from 'lucide-react';
import { cn } from '../lib/utils';

export default function DashboardLayout() {
  const location = useLocation();

  const navItems = [
    { name: 'Deployments', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Build Agent', path: '/dashboard/build', icon: PlusCircle },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="h-screen bg-gray-50 flex font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2 text-gray-900 font-bold tracking-tight text-lg">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            GHOST OP
          </Link>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-blue-50 text-blue-600" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Production Mode</div>
              <div className="text-[10px] text-gray-500">Usage: 84% of Pro Plan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50">
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-8 bg-white">
           <div className="font-medium text-gray-900 flex items-center gap-2">
             <span className="text-gray-500">Project:</span> Startup Data
           </div>
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-[10px] font-bold bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200 uppercase">
               <Activity className="w-3 h-3 text-green-500 status-pulse" />
               Active
             </div>
           </div>
        </header>
        <div className="flex-1 overflow-auto bg-gray-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
