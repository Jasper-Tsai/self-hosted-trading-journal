'use client';

import { useLanguage } from '@/contexts/LanguageContext';

export function AccessDenied() {
  const { t } = useLanguage();

  return (
    <div className="min-h-[50vh] flex items-center justify-center text-[#8A8F98]">
      {t('accessDenied')}
    </div>
  );
}
