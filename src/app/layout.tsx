import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Pinho · Gestão',
  description: 'Entradas de peças, pagamentos e indicadores das oficinas de costura.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Pinho', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FBF6F2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500..800&family=Nunito+Sans:opsz,wght@6..12,400..800&display=swap"
        />
        <link rel="icon" href="/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
