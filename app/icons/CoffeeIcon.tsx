// app/icons/CoffeeIcon.tsx
import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

/**
 * Ícone de Xícara de Café para o botão de Notícias Dinâmicas.
 */
export const CoffeeIcon: React.FC<IconProps> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Xícara */}
    <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
    <path d="M5 8h10a4 4 0 0 1 4 4 4 4 0 0 1-4 4H5Z" />
    {/* Prato */}
    <path d="M3 16h18" />
    {/* Vapor */}
    <path d="M7 5v.01" />
    <path d="M11 5v.01" />
    <path d="M15 5v.01" />
  </svg>
);
