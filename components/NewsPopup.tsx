// components/NewsPopup.tsx
'use client';

interface NewsPopupProps {
  onClose: () => void;
}

export function NewsPopup({ onClose }: NewsPopupProps) {
  return (
    // 1. Overlay de Fundo (Backdrop)
    // Cobre a tela inteira, fica no topo (z-50) e tem 'pointer-events-auto'
    <div
      className="fixed inset-0 z-50 flex items-center justify-center 
                 bg-black/70 backdrop-blur-sm 
                 pointer-events-auto"
      onClick={onClose} // Fecha o modal ao clicar fora da caixa de conteúdo
    >
      {/* 2. Caixa de Conteúdo do Modal */}
      {/* 'w-11/12' (mobile) e 'max-w-2xl' (desktop) o tornam responsivo.
          'overflow-y-auto' e 'max-h-[80vh]' permitem scroll interno.
          'onClick' impede que o clique "vaze" para o backdrop e feche o modal. */}
      <div
        className="bg-gray-800 text-white rounded-lg shadow-2xl 
                   w-11/12 max-w-2xl max-h-[80vh] 
                   flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div className="flex justify-between items-center p-4 md:p-6 border-b border-gray-700">
          <h2 className="text-xl md:text-2xl font-bold">Notícias Globais</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Fechar"
          >
            {/* Ícone 'X' (Fechar) */}
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo do Modal (com scroll) */}
        <div className="p-4 md:p-6 overflow-y-auto">
          <p className="text-gray-300 mb-4">
            Aqui você renderizaria a lista de notícias de todos os estados e países.
          </p>
          
          {/* Exemplo de lista de notícias (substitua pelo seu map) */}
          <div className="space-y-4">
            {['Brasil', 'Japão', 'EUA', 'Nigéria', 'Alemanha', 'Austrália'].map((pais) => (
              <div key={pais} className="p-3 bg-gray-700 rounded-md">
                <h3 className="font-semibold text-lg text-cyan-400">{pais}</h3>
                <p className="text-sm text-gray-300">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
                  Duis vel urna nec elit tempus.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}