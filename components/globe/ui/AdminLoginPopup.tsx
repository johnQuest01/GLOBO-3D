'use client';

import React, { FC, useState } from 'react';

/**
 * Entrada do painel de administração.
 *
 * As credenciais são conferidas em `/api/admin/login`, no servidor — o
 * navegador nunca recebe a senha, só um sim ou não. Ver o comentário da rota
 * para o alcance (e os limites) dessa proteção.
 */

interface AdminLoginPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AdminLoginPopup: FC<AdminLoginPopupProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsChecking(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        setEmail('');
        setPassword('');
        onSuccess();
        return;
      }

      if (res.status === 503) {
        setError(
          'Painel sem credencial configurada no servidor (ADMIN_EMAIL / ADMIN_PASSWORD).',
        );
        return;
      }

      setError('E-mail ou senha incorretos.');
    } catch {
      setError('Não foi possível falar com o servidor.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-2xl ring-1 ring-white/10"
      >
        <h2 className="mb-1 text-xl font-bold text-cyan-400">Área do administrador</h2>
        <p className="mb-5 text-sm text-gray-400">
          Controle das animações do globo.
        </p>

        <label className="mb-1 block text-sm text-gray-300" htmlFor="admin-email">
          E-mail
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg bg-gray-800 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-500"
          placeholder="voce@exemplo.com"
          required
        />

        <label className="mb-1 block text-sm text-gray-300" htmlFor="admin-password">
          Senha
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg bg-gray-800 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-500"
          required
        />

        {error && (
          <p className="mb-4 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isChecking}
            className="rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {isChecking ? 'Verificando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminLoginPopup;
