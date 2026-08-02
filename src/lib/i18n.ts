export type Language = 'en' | 'zh-TW';

export type TranslationKey =
  | 'todayOverview'
  | 'dateOverview'
  | 'dashboardDescription'
  | 'trades'
  | 'tradesDescription'
  | 'tradesPageDescription'
  | 'review'
  | 'reviewDescription'
  | 'calendar'
  | 'calendarDescription'
  | 'csv'
  | 'csvDescription'
  | 'strategyPerformance'
  | 'strategyPerformanceDescription'
  | 'strategyManager'
  | 'strategyManagerDescription'
  | 'brokerManager'
  | 'brokerManagerDescription'
  | 'productManager'
  | 'productManagerDescription'
  | 'signOut'
  | 'changeDefaultPassword'
  | 'toggleMenu'
  | 'language'
  | 'english'
  | 'traditionalChinese'
  | 'login'
  | 'loginDescription'
  | 'username'
  | 'password'
  | 'signingIn'
  | 'invalidCredentials'
  | 'authNotConfigured'
  | 'calendarTitle'
  | 'calendarDescription'
  | 'reviewTitle'
  | 'reviewDescription'
  | 'strategyManagerTitle'
  | 'strategyManagerDescription'
  | 'accessDenied'
  | 'loading'
  | 'redirecting'
  | 'strategyPerformanceTitle'
  | 'strategyPerformanceDescription'
  | 'noStrategyData'
  | 'loadingFailed';

type TranslationValue = string | ((params: Record<string, string | number>) => string);

const EN: Record<TranslationKey, TranslationValue> = {
  todayOverview: "Today's Overview",
  dateOverview: ({ month, day }) => `${month}/${day} Overview`,
  dashboardDescription: 'View trading performance and statistics',
  trades: 'Trades',
  tradesDescription: 'Create and manage trades',
  tradesPageDescription: 'Create and manage trades. P&L and statistics are calculated automatically.',
  review: 'Review',
  reviewDescription: 'Weekly/monthly reports and performance analysis',
  calendar: 'Trading Calendar',
  calendarDescription: 'Monthly P&L calendar',
  csv: 'CSV',
  csvDescription: 'Import and export trade data',
  strategyPerformance: 'Strategy Performance',
  strategyPerformanceDescription: 'Total/range performance by strategy, R:R, PF, MaxDD',
  strategyManager: 'Strategy Manager',
  strategyManagerDescription: 'Manage trading strategies and defaults',
  brokerManager: 'Broker Manager',
  brokerManagerDescription: 'Manage brokers and per-contract fees',
  productManager: 'Product Manager',
  productManagerDescription: 'Manage trading products (MNQ, NQ, SIL, etc.)',
  signOut: 'Sign out',
  changeDefaultPassword: 'Change default password',
  toggleMenu: 'Toggle menu',
  language: 'Language',
  english: 'EN',
  traditionalChinese: '中',
  login: 'Sign in',
  loginDescription: 'Use your local admin account to access the trading journal',
  username: 'Username',
  password: 'Password',
  signingIn: 'Signing in...',
  invalidCredentials: 'Invalid username or password',
  authNotConfigured: 'Authentication is not configured. Set JOURNAL_PASSWORD and JOURNAL_SESSION_SECRET first.',
  calendarTitle: 'Trading Calendar',
  reviewTitle: 'Review',
  strategyManagerTitle: 'Strategy Manager',
  accessDenied: 'This page is not available.',
  loading: 'Loading...',
  redirecting: 'Redirecting...',
  strategyPerformanceTitle: 'Strategy Performance',
  noStrategyData: 'No strategy performance data yet',
  loadingFailed: 'Loading failed',
};

const ZH_TW: Partial<Record<TranslationKey, TranslationValue>> = {
  todayOverview: '今日總覽',
  dateOverview: ({ month, day }) => `${month}月${day}日總覽`,
  dashboardDescription: '查看交易績效與統計資料',
  trades: '交易紀錄',
  tradesDescription: '新增與管理交易紀錄',
  tradesPageDescription: '新增與管理交易紀錄，損益與統計資料會自動計算。',
  review: '回顧分析',
  reviewDescription: '週/月報表與績效分析',
  calendar: '交易日曆',
  calendarDescription: '每月損益日曆',
  csvDescription: '匯入與匯出交易資料',
  strategyPerformance: '策略績效',
  strategyPerformanceDescription: '各策略總/區間績效、R:R、PF、MaxDD',
  strategyManager: '策略管理',
  strategyManagerDescription: '管理交易策略與預設值',
  brokerManager: '券商管理',
  brokerManagerDescription: '管理券商與每口手續費',
  productManager: '商品管理',
  productManagerDescription: '管理交易商品（MNQ、NQ、SIL 等）',
  signOut: '登出',
  changeDefaultPassword: '變更預設密碼',
  toggleMenu: '切換選單',
  language: '語言',
  login: '登入',
  loginDescription: '使用本機管理員帳號進入交易日誌',
  username: '帳號',
  password: '密碼',
  signingIn: '登入中...',
  invalidCredentials: '帳號或密碼錯誤',
  authNotConfigured: '尚未設定登入密碼，請先設定 JOURNAL_PASSWORD 與 JOURNAL_SESSION_SECRET',
  calendarTitle: '交易日曆',
  reviewTitle: '回顧分析',
  strategyManagerTitle: '策略管理',
  accessDenied: '此頁面無法使用。',
  loading: '載入中...',
  redirecting: '重新導向中...',
  strategyPerformanceTitle: '策略績效',
  noStrategyData: '尚無策略績效資料',
  loadingFailed: '載入失敗',
};

export function getTranslation(
  language: Language,
  key: TranslationKey,
  params: Record<string, string | number> = {},
): string {
  const value = language === 'zh-TW' ? (ZH_TW[key] ?? EN[key]) : EN[key];
  return typeof value === 'function' ? value(params) : value;
}
