import type { Metadata, Viewport } from 'next'; // Importe 'Viewport' também!
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// 1. O OBJETO METADATA NÃO TEM MAIS VIEWPORT
export const metadata: Metadata = {
  title: 'Globo Interativo', // Título permanece aqui
  description: 'Uma aplicação web interativa com Next.js e Three.js',
  // REMOVA 'viewport' daqui!
};

// 2. VIEWPORT AGORA É UM EXPORT SEPARADO
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  // Sem 'cover' o navegador nao expoe as areas seguras, e todo
  // env(safe-area-inset-*) volta zero — os botoes de baixo acabam embaixo da
  // barra do proprio navegador no celular.
  viewportFit: 'cover',

  /*
   * O TECLADO DO CELULAR PRECISA ENCOLHER A PAGINA.
   *
   * Por padrao, abrir o teclado NAO muda a altura que o CSS enxerga: nem
   * `100vh` nem `100dvh` descontam os ~300px que ele ocupa. O teclado
   * simplesmente sobe POR CIMA do conteudo.
   *
   * No chat isso e' fatal e foi exatamente o defeito relatado: o campo de
   * escrever fica no rodape da conversa, entao tocar nele abre o teclado que
   * cobre o proprio campo e o botao de enviar. A pessoa digita e nao consegue
   * mandar — parece que o botao nao funciona.
   *
   * `resizes-content` faz o navegador encolher a area de layout quando o
   * teclado aparece. O `100dvh` da conversa passa a valer o que sobra, e o
   * rodape com o botao sobe junto, ficando logo acima do teclado.
   */
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      >
        {children}
      </body>
    </html>
  );
}
