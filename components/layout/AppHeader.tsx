import React from 'react';
import MenuIcon from '@/app/icons/MenuIcon';

export type AppHeaderProps = {
  isVisible: boolean;
  onMenuClick?: () => void;
};

const AppHeader: React.FC<AppHeaderProps> = ({ isVisible, onMenuClick }) => (
  <header
    className={`absolute top-0 left-0 right-0 z-40 p-4 bg-gradient-to-b from-black/70 to-transparent transition-transform duration-300 ease-in-out flex justify-between items-center ${
      isVisible ? 'translate-y-0' : '-translate-y-full'
    }`}
    onClick={(e) => e.stopPropagation()}
    onPointerDown={(e) => e.stopPropagation()}
  >
    <h1 className="text-white text-xl sm:text-2xl font-bold text-shadow-lg">
      Meu Globo Interativo
    </h1>
    <button
      className="p-2 rounded-full text-white bg-white/10 hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
      title="Menu"
      onClick={(e) => {
        e.stopPropagation();
        onMenuClick?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MenuIcon className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  </header>
);

export default AppHeader;
