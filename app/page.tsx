'use client'; // Necessário pois DynamicGlobe usa hooks de cliente

// --- CORREÇÃO DA TELA PRETA ---
// O arquivo page.tsx deve exportar o *conteúdo* da página,
// e não o Layout. Vamos importar e renderizar seu componente principal do globo.

import DynamicGlobe from '@/components/DynamicGlobe';

/**
 * Esta é a página principal (rota "/") do seu aplicativo.
 */
export default function HomePage() {
  // Simplesmente renderizamos o componente de globo dinâmico
  // que já é carregado do lado do cliente (ssr: false).
  return <DynamicGlobe />;
}
