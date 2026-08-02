'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LanguageToggle } from '@/components/language-toggle';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/lib/i18n';
import type { PageKey } from '@/config/features';

interface NavItem {
  href: string;
  pageKey?: PageKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    pageKey: 'dashboard',
    labelKey: 'todayOverview',
    descriptionKey: 'dashboardDescription',
  },
  {
    href: '/trades',
    pageKey: 'trades',
    labelKey: 'trades',
    descriptionKey: 'tradesDescription',
  },
  {
    href: '/review',
    pageKey: 'review',
    labelKey: 'review',
    descriptionKey: 'reviewDescription',
  },
  {
    href: '/calendar',
    pageKey: 'calendar',
    labelKey: 'calendar',
    descriptionKey: 'calendarDescription',
  },
  {
    href: '/csv',
    pageKey: 'csv',
    labelKey: 'csv',
    descriptionKey: 'csvDescription',
  },
];

const OWNER_ONLY_NAV_ITEMS: NavItem[] = [
  {
    href: '/strategy-performance',
    labelKey: 'strategyPerformance',
    descriptionKey: 'strategyPerformanceDescription',
  },
  {
    href: '/strategies',
    labelKey: 'strategyManager',
    descriptionKey: 'strategyManagerDescription',
  },
  {
    href: '/brokers',
    labelKey: 'brokerManager',
    descriptionKey: 'brokerManagerDescription',
  },
  {
    href: '/products',
    labelKey: 'productManager',
    descriptionKey: 'productManagerDescription',
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
  const { t } = useLanguage();

  // according to feature flags Filter navigation items
  const enabledSet = enabledPages ? new Set(enabledPages) : null;
  const navItems = ALL_NAV_ITEMS.filter(item =>
    enabledSet === null || (item.pageKey !== undefined && enabledSet.has(item.pageKey))
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
                {t(item.labelKey)}
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
                {t(item.labelKey)}
                {pathname === item.href && (
                  <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[#5E6AD2] rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LanguageToggle />
            {isUsingDefaultPassword && (
              <span className="hidden xl:inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                {t('changeDefaultPassword')}
              </span>
            )}
            <button
              onClick={() => void signOut()}
              className="hidden sm:inline-flex rounded-lg px-3 py-1.5 text-sm font-medium text-[#8A8F98] transition-colors duration-200 hover:bg-white/[0.05] hover:text-[#EDEDEF]"
            >
              {t('signOut')}
            </button>
            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 hover:bg-white/[0.05] rounded-lg transition-colors duration-200"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={t('toggleMenu')}
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
                  <div className="font-medium text-sm">{t(item.labelKey)}</div>
                  <div className="text-xs text-white/30 mt-0.5">{t(item.descriptionKey)}</div>
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
                  <div className="font-medium text-sm">{t(item.labelKey)}</div>
                  <div className="text-xs text-white/30 mt-0.5">{t(item.descriptionKey)}</div>
                </Link>
              ))}
              {isUsingDefaultPassword && (
                <div className="px-3 py-2 text-xs text-amber-300">
                  {t('changeDefaultPassword')}
                </div>
              )}
              <button
                onClick={() => void signOut()}
                className="px-3 py-2.5 text-left text-sm font-medium text-[#8A8F98] transition-colors duration-200 hover:text-[#EDEDEF]"
              >
                {t('signOut')}
              </button>

            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
