// ROIP APP 9BOX — configuracao canonica do Next.js (ME-055 Bloco A).
//
// Configuracao minima canonica compativel com App Router (Next.js
// 15.5.20 + React 19.2.7). Strict mode ativo para catch de anti-
// patterns em desenvolvimento.

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
