// ROIP APP 9BOX — configuracao canonica do PostCSS (ME-055 Bloco A).
//
// Configuracao minima canonica: Tailwind processa @tailwind directives
// e autoprefixer adiciona prefixos vendor. Ambos sao pinned via package
// deps (Tailwind 3.4.17 + autoprefixer 10.4.20).

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
