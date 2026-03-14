'use client';

import { useState, useEffect, useCallback } from 'react';

// A chave que usaremos no localStorage para sincronizar entre as abas.
const STORAGE_KEY = 'global-animation-controls';

/**
 * Define a estrutura do estado de animação.
 * Cada chave representa uma animação controlável.
 */
export interface AnimationState {
  'missile-kiev-moscow': boolean;
  'missile-moscow-kiev': boolean;
  'airplane-travel': boolean;
  // Adicione mais chaves aqui conforme novas animações surgirem
}

/**
 * O estado padrão quando o app é carregado pela primeira vez.
 */
const DEFAULT_STATE: AnimationState = {
  'missile-kiev-moscow': true,
  'missile-moscow-kiev': true,
  'airplane-travel': true,
};

/**
 * Hook para gerenciar e sincronizar o estado das animações
 * através do localStorage (para refletir em todas as abas).
 */
export function useAnimationControls() {
  const [animationState, setAnimationState] = useState<AnimationState>(DEFAULT_STATE);

  // Efeito para carregar o estado inicial do localStorage e ouvir mudanças
  useEffect(() => {
    // 1. Tenta carregar o estado salvo no localStorage
    try {
      const storedState = localStorage.getItem(STORAGE_KEY);
      if (storedState) {
        setAnimationState(JSON.parse(storedState));
      } else {
        // Se não houver, salva o estado padrão
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATE));
      }
    } catch (error) {
      console.error("Falha ao ler 'animation-controls' do localStorage:", error);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATE));
    }

    // 2. Adiciona um listener para o evento 'storage'
    // Isso é o que faz a mágica de "refletir para todos os usuários" (em outras abas)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          setAnimationState(JSON.parse(event.newValue));
        } catch (error) {
          // --- CORREÇÃO APLICADA ---
          // Usei aspas duplas na string externa para permitir as aspas simples internas.
          console.error("Falha ao parsear 'animation-controls' do evento storage:", error);
          // --- FIM DA CORREÇÃO ---
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // 3. Cleanup: remove o listener quando o componente desmontar
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // Executa apenas uma vez, na montagem

  /**
   * Função interna para atualizar o estado E o localStorage.
   */
  const updateStateAndStorage = useCallback((newState: AnimationState) => {
    setAnimationState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (error) {
      console.error("Falha ao salvar 'animation-controls' no localStorage:", error);
    }
  }, []);

  // --- Funções de Controle (para o Admin) ---

  /**
   * Para o popup: alterna o estado de uma animação específica.
   */
  const toggleAnimation = useCallback(
    (key: keyof AnimationState) => {
      const newState = { ...animationState, [key]: !animationState[key] };
      updateStateAndStorage(newState);
    },
    [animationState, updateStateAndStorage]
  );

  /**
   * Para o botão "Parar Todas": desativa todas as animações.
   */
  const stopAllAnimations = useCallback(() => {
    const newState: AnimationState = { ...animationState };
    (Object.keys(newState) as Array<keyof AnimationState>).forEach((key) => {
      newState[key] = false;
    });
    updateStateAndStorage(newState);
  }, [animationState, updateStateAndStorage]);

  /**
   * Para o botão "Ativar Todas": ativa todas as animações.
   */
  const startAllAnimations = useCallback(() => {
    const newState: AnimationState = { ...animationState };
    (Object.keys(newState) as Array<keyof AnimationState>).forEach((key) => {
      newState[key] = true;
    });
    updateStateAndStorage(newState);
  }, [animationState, updateStateAndStorage]);

  return {
    animationState,
    toggleAnimation,
    stopAllAnimations,
    startAllAnimations,
  };
}

