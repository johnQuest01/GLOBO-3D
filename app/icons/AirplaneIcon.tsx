// app/icons/AirplaneIcon.tsx
import React from 'react';

// Correção: Trocamos 'interface' por 'type'
// Isso resolve o aviso do linter '@typescript-eslint/no-empty-object-type'
// pois 'type' é a forma preferida para criar um alias para outro tipo.
type IconProps = React.SVGProps<SVGSVGElement>;

/**
 * Ícone de avião para o botão de viagem.
 */
export const AirplaneIcon: React.FC<IconProps> = (props) => (
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
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 5.2 5.2c.4.4 1 .5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </svg>
);