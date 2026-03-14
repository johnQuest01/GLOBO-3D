// components/globe/ui/UserProfilePopup.tsx
'use client';

import React, { FC } from 'react';
import { UserProfileData } from '@/app/types/user'; // Import the new centralized type

// Define os tipos de props que o GlobeCanvas.tsx espera
export type { UserProfileData }; // Re-exporta o tipo

interface UserProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  user: UserProfileData | null;
}

// Ícones simples para o popup
const IconUser = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
    />
  </svg>
);
const IconCake = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.52l1.565-3.03L6.03 9.74a.375.375 0 01.557-.521l5.603 3.113z"
    />
  </svg>
);
const IconHome = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  </svg>
);
const IconMail = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.907l-7.195 3.583a2.25 2.25 0 01-2.36 0L3.32 8.907A2.25 2.25 0 012.25 6.993V6.75"
    />
  </svg>
);

const InfoRow: FC<{
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
}> = ({ icon, label, value }) => (
  <div className="flex items-start space-x-4">
    <span className="mt-1">{icon}</span>
    <div className="flex-1">
      <h4 className="text-base font-medium text-gray-400">{label}</h4>
      <p className="text-lg font-semibold text-white truncate">
        {value || 'Não informado'}
      </p>
    </div>
  </div>
);

const UserProfilePopup: FC<UserProfilePopupProps> = ({
  isOpen,
  onClose,
  onLogout,
  user,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 z-10 animate-in fade-in-0 duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative z-20 w-[90vw] max-w-md">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-green-700 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
          {/* Cabeçalho */}
          <div className="p-5 border-b border-green-700 shrink-0">
            <h2 className="text-2xl font-bold text-green-400">Meu Perfil</h2>
            <p className="text-base text-gray-400 mt-1">
              Suas informações de cadastro.
            </p>
          </div>

          {/* Corpo Scrollável */}
          <div className="p-6 space-y-6 overflow-y-auto">
            {user ? (
              <>
                <InfoRow
                  icon={<IconUser />}
                  label="Nome Completo"
                  value={user.fullName}
                />
                <InfoRow
                  icon={<IconCake />}
                  label="Idade"
                  value={`${user.age} anos`}
                />
                <InfoRow icon={<IconHome />} label="Cidade" value={user.city} />
                <InfoRow icon={<IconMail />} label="Email" value={user.email} />
              </>
            ) : (
              <p className="text-gray-400 text-center">
                Erro ao carregar dados do usuário.
              </p>
            )}
          </div>

          {/* Rodapé com Ações */}
          <div className="p-4 flex justify-between items-center border-t border-gray-700 bg-gray-900 rounded-b-xl shrink-0">
            <button
              type="button"
              onClick={onLogout}
              className="px-6 py-3 text-base bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Sair (Logout)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-base bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfilePopup;
