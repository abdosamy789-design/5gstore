import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import { LanguageProvider } from '@/context/LanguageContext';
import { ApiAppProvider } from '@/context/ApiAppContext';
import MainLayout from '@/components/MainLayout';
import "./globals.css";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Mobile Line Manager",
  description: "Converted from ReactJS to NextJS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={inter.className}
      >
        <LanguageProvider>
          <ApiAppProvider>
            <MainLayout>
              {children}
            </MainLayout>
          </ApiAppProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
