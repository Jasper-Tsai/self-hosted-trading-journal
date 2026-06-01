import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/auth-guard';
import { AmbientBackground } from '@/components/ui/ambient-background';
import { features } from '@/config/features';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: features.brandName,
  description: "專業的期貨交易日誌與分析工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const enabledPageKeys = Array.from(features.enabledPages);

  return (
    <html lang="zh-TW" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <AuthGuard>
            <AmbientBackground />
            <div className="relative z-10 min-h-screen overflow-x-hidden">
              <Navigation brandName={features.brandName} enabledPages={enabledPageKeys} />
              <main className="container mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-8 lg:px-8">
                {children}
              </main>
            </div>
          </AuthGuard>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: 'rgba(10, 10, 12, 0.95)',
                color: '#EDEDEF',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.5)',
                borderRadius: '12px',
                fontSize: '14px',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
