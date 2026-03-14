import React from 'react';

export type AppFooterProps = {
  isVisible: boolean;
  onVacationClick?: () => void;
};

const AppFooter: React.FC<AppFooterProps> = ({ isVisible, onVacationClick }) => (
  <footer
    className={`absolute bottom-0 left-0 right-0 z-40 min-h-16 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/70 to-transparent transition-transform duration-300 ease-in-out flex items-center justify-between ${
      isVisible ? 'translate-y-0' : 'translate-y-full'
    }`}
    onClick={(e) => e.stopPropagation()}
    onPointerDown={(e) => e.stopPropagation()}
  >
    <div className="text-white text-xs sm:text-sm opacity-70 flex-1">
      Explorando o mundo com R3F e Next.js
    </div>
    <div className="flex-shrink-0 mx-4">
      <button
        className="px-4 py-2 text-sm sm:text-base font-medium rounded-full shadow-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-colors"
        title="Ver opções de férias"
        onClick={(e) => {
          e.stopPropagation();
          onVacationClick?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        Férias
      </button>
    </div>
    <div className="flex-1"></div>
  </footer>
);

export default AppFooter;
