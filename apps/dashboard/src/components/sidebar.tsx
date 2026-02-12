'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Key,
  Plug,
  BarChart3,
  LogOut,
} from 'lucide-react';
import { clearAdminToken } from '@/lib/auth';
import { useDemo } from '@/lib/demo-context';

const navItems = [
  { label: 'Overview', href: '/overview', icon: LayoutDashboard },
  { label: 'Keys', href: '/keys', icon: Key },
  { label: 'Connectors', href: '/connectors', icon: Plug },
  { label: 'Usage', href: '/usage', icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDemo, exitDemo } = useDemo();

  function handleLogout() {
    if (isDemo) {
      exitDemo();
      router.push('/login');
      return;
    }
    clearAdminToken();
    router.push('/login');
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="flex h-14 items-center gap-2 px-5">
        <img
          src="/feelr-logomark.svg"
          alt="Feelr"
          width={28}
          height={28}
        />
        <span className="text-lg font-semibold tracking-tight text-white">
          Feelr
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
