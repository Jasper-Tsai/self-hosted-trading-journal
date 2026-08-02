'use client';

import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t('language')}
      title={t('language')}
      className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.04] p-0.5"
    >
      <Languages className="ml-1 h-3.5 w-3.5 text-[#8A8F98]" aria-hidden="true" />
      <button
        type="button"
        aria-label="繁體中文"
        aria-pressed={language === 'zh-TW'}
        onClick={() => setLanguage('zh-TW')}
        className={cn(
          'h-7 min-w-7 rounded-md px-1.5 text-xs font-medium transition-colors duration-200',
          language === 'zh-TW'
            ? 'bg-[#5E6AD2] text-white shadow-[0_0_12px_rgba(94,106,210,0.3)]'
            : 'text-[#8A8F98] hover:bg-white/[0.06] hover:text-[#EDEDEF]',
        )}
      >
        {t('traditionalChinese')}
      </button>
      <button
        type="button"
        aria-label="English"
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
        className={cn(
          'h-7 min-w-7 rounded-md px-1.5 text-xs font-medium transition-colors duration-200',
          language === 'en'
            ? 'bg-[#5E6AD2] text-white shadow-[0_0_12px_rgba(94,106,210,0.3)]'
            : 'text-[#8A8F98] hover:bg-white/[0.06] hover:text-[#EDEDEF]',
        )}
      >
        {t('english')}
      </button>
    </div>
  );
}
