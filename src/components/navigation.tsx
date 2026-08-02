'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { PageKey } from '@/config/features';

const ALL_NAV_ITEMS = [
  {
    href: '/',
    pageKey: 'dashboard' as PageKey,
    label: "Today's Overview",
    description: "View today's trading statistics and charts"
  },
  {
    href: '/trades',
    pageKey: 'trades' as PageKey,
    label: 'Trades',
    description: 'Create and manage trades'
  },
  {
    href: '/review',
    pageKey: 'review' as PageKey,
    label: 'Review',
    description: 'Weekly/monthly reports and performance analysis'
  },
  {
    href: '/calendar',
    pageKey: 'calendar' as PageKey,
    label: 'Trading Calendar',
    description: 'Monthly P&L calendar'
  },
  {
    href: '/csv',
    pageKey: 'csv' as PageKey,
    label: 'CSV',
    description: 'Import and export trade data'
  },
];

const OWNER_ONLY_NAV_ITEMS = [
  {
    href: '/strategy-performance',
    label: 'Strategy Performance',
    description: 'Total/range performance by strategy, R:R, PF, MaxDD',
  },
  {
    href: '/strategies',
    label: 'Strategy Manager',
    description: 'Manage trading strategies and defaults',
  },
  {
    href: '/brokers',
    label: 'Broker Manager',
    description: 'Manage brokers and per-contract fees',
  },
  {
    href: '/products',
    label: 'Product Manager',
    description: 'Manage trading products (MNQ, NQ, SIL, etc.)',
  },
];

interface NavigationProps {
  brandName?: string;
  enabledPages?: PageKey[];
}

export function Navigation({ brandName = 'Self-Hosted Trading Journal', enabledPages }: NavigationProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isOwner, isUsingDefaultPassword, signOut } = useAuth();

  // according to feature flags Filter navigation items
  const enabledSet = enabledPages ? new Set(enabledPages) : null;
  const navItems = ALL_NAV_ITEMS.filter(item =>
    enabledSet === null || enabledSet.has(item.pageKey)
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#050506]/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <Image
                src="/logo.svg"
                alt="Trading Journey Logo"
                width={32}
                height={32}
                className="shrink-0 drop-shadow-[0_0_8px_rgba(79,215,255,0.35)] group-hover:drop-shadow-[0_0_14px_rgba(79,215,255,0.55)] transition-[filter] duration-200"
                priority
              />
              <span className="font-semibold tracking-tight hidden sm:inline-block bg-gradient-to-b from-white via-white/90 to-white/60 bg-clip-text text-transparent">
                {brandName}
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-3 py-1.5 rounded-lg transition-all duration-200',
                  pathname === item.href
                    ? 'text-[#EDEDEF] bg-white/[0.08]'
                    : 'text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05]'
                )}
              >
                {item.label}
                {pathname === item.href && (
                  <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[#5E6AD2] rounded-full" />
                )}
              </Link>
            ))}
            {isOwner && OWNER_ONLY_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-3 py-1.5 rounded-lg transition-all duration-200',
                  pathname === item.href
                    ? 'text-[#EDEDEF] bg-white/[0.08]'
                    : 'text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05]'
                )}
              >
                {item.label}
                {pathname === item.href && (
                  <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[#5E6AD2] rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {isUsingDefaultPassword && (
              <span className="hidden xl:inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                Change default password
              </span>
            )}
            <button
              onClick={() => void signOut()}
              className="hidden sm:inline-flex rounded-lg px-3 py-1.5 text-sm font-medium text-[#8A8F98] transition-colors duration-200 hover:bg-white/[0.05] hover:text-[#EDEDEF]"
            >
              Sign out
            </button>
            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 hover:bg-white/[0.05] rounded-lg transition-colors duration-200"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg
                className="w-5 h-5 text-[#8A8F98]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-white/[0.06] animate-fade-in-up" style={{ animationDuration: '200ms' }}>
            <nav className="flex flex-col space-y-0.5">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-3 py-2.5 rounded-lg transition-all duration-200',
                    pathname === item.href
                      ? 'bg-white/[0.08] text-[#EDEDEF]'
                      : 'text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.04]'
                  )}
                >
                  <div className="font-medium text-sm">{item.label}</div>
                  <div className="text-xs text-white/30 mt-0.5">{item.description}</div>
                </Link>
              ))}
              {isOwner && OWNER_ONLY_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-3 py-2.5 rounded-lg transition-all duration-200',
                    pathname === item.href
                      ? 'bg-white/[0.08] text-[#EDEDEF]'
                      : 'text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.04]'
                  )}
                >
                  <div className="font-medium text-sm">{item.label}</div>
                  <div className="text-xs text-white/30 mt-0.5">{item.description}</div>
                </Link>
              ))}
              {isUsingDefaultPassword && (
                <div className="px-3 py-2 text-xs text-amber-300">
                  Change the default password before exposing this app.
                </div>
              )}
              <button
                onClick={() => void signOut()}
                className="px-3 py-2.5 text-left text-sm font-medium text-[#8A8F98] transition-colors duration-200 hover:text-[#EDEDEF]"
              >
                Sign out
              </button>

            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
