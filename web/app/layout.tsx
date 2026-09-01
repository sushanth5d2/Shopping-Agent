import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'ShopAgent',
  description: 'Personal AI shopping agent',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
