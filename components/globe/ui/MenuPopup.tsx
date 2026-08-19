// components/globe/ui/MenuPopup.tsx
'use client';
import React, { FC } from 'react';

interface MenuPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onMyNewsClick: () => void;
  onMyTouristSitesClick: () => void;
  onMyVacationSpotsClick: () => void; // <-- O handler disto será mudado no GlobeCanvas
  onAdminClick: () => void;
  isAdmin: boolean;
  onAdminExit: () => void;
}

const MenuButton: FC<{
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, children, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full p-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

const MenuPopup: FC<MenuPopupProps> = ({
  isOpen,
  onClose,
  onMyNewsClick,
  onMyTouristSitesClick,
  onMyVacationSpotsClick, // <-- Este botão agora abre a *lista* de locais
  onAdminClick,
  isAdmin,
  onAdminExit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      <div
        className="absolute inset-0 bg-black/60 z-10"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-20 w-[90vw] max-w-sm">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300">
          <div className="p-4 border-b border-cyan-700">
            <h2 className="text-xl font-bold text-cyan-400">Menu Principal</h2>
          </div>
          <div className="p-6 space-y-4">
            <MenuButton onClick={onMyNewsClick}>Minhas Notícias</MenuButton>
            <MenuButton onClick={onMyTouristSitesClick}>
              Meus Locais Turísticos
            </MenuButton>
            <MenuButton onClick={onMyVacationSpotsClick}>
              Meus Locais de Férias
            </MenuButton>

            <div className="my-2 border-t border-white/10" />
            {isAdmin ? (
              <MenuButton onClick={onAdminExit}>Sair do modo administrador</MenuButton>
            ) : (
              <MenuButton onClick={onAdminClick}>Administrador</MenuButton>
            )}
          </div>
          <div className="p-4 flex justify-end border-t border-gray-700 bg-gray-900 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MenuPopup;