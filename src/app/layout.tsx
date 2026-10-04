import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TyWygrywasz.pl — Twój porządek w sprawie',
  description: 'Prywatny, local-first sejf do prowadzenia spraw, dokumentów i pism urzędowych.',
  applicationName: 'TyWygrywasz.pl',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
