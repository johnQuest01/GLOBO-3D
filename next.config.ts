import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' empacota só o necessário para rodar, o que deixa a imagem
  // Docker do Fly.io pequena. Na Vercel a opção é ignorada, então serve nos dois.
  output: "standalone",

  async headers() {
    return [
      {
        // Texturas e fronteiras são artefatos de build com nome/versão fixos:
        // podem ficar no cache do navegador por um ano.
        source: "/textures/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
