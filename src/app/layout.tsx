// ROIP APP 9BOX — layout root canonico (ME-055 Bloco A).
//
// Injeta a fonte Inter via `next/font/google` (§2.2 canonico) e a
// disponibiliza como CSS variable `--font-inter` consumida por
// `globals.css`. Wrapper minimo `<html>/<body>` — o shell canonico
// (sidebar, header, layout perfil-agnostic) e enxertado pelas paginas
// que o exigem via Bloco B.

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'ROIP APP 9BOX',
  description: 'Plataforma de people analytics para PMEs brasileiras',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
