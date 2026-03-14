// app/hooks/useSavedVacationSpots.ts
'use client';
import { useState, useEffect, useCallback } from 'react';
import { SavedVacationSpot } from '@/app/types/globe';

const STORAGE_KEY = 'saved-vacation-spots';

/**
 * Hook para gerenciar locais de férias salvos (Pins)
 * Sincronizado com o localStorage.
 */
export function useSavedVacationSpots() {
  const [savedSpots, setSavedSpots] = useState<SavedVacationSpot[]>([]);

  // 1. Carrega do localStorage na montagem E Ouve por mudanças
  useEffect(() => {
    const loadStateFromStorage = () => {
      try {
        const storedState = localStorage.getItem(STORAGE_KEY);
        if (storedState) {
          setSavedSpots(JSON.parse(storedState));
        }
      } catch (error) {
        console.error(
          "Falha ao carregar 'saved-vacation-spots' do localStorage:",
          error
        );
      }
    };

    loadStateFromStorage();

    // Listener para sincronizar entre instâncias/abas
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          setSavedSpots(JSON.parse(event.newValue));
        } catch (error) {
          console.error(
            "Falha ao parsear 'saved-vacation-spots' do evento de storage:",
            error
          );
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 2. Helper para atualizar estado e localStorage
  const updateStateAndStorage = useCallback((newState: SavedVacationSpot[]) => {
    newState.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
    setSavedSpots(newState);

    try {
      const newStateJSON = JSON.stringify(newState);
      localStorage.setItem(STORAGE_KEY, newStateJSON);

      // Dispara evento para a aba atual
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: newStateJSON,
        })
      );
    } catch (error) {
      console.error(
        "Falha ao salvar 'saved-vacation-spots' no localStorage:",
        error
      );
    }
  }, []);

  // 3. Adicionar item
  const addSavedSpot = useCallback(
    (placeKey: string, placeName: string) => {
      const newItem: SavedVacationSpot = {
        placeKey,
        placeName,
        savedAt: new Date().toISOString(),
      };
      setSavedSpots((currentSpots) => {
        // Evita duplicatas
        const existing = currentSpots.find(
          (item) => item.placeKey === placeKey
        );
        if (existing) return currentSpots;

        const updatedSpots = [...currentSpots, newItem];
        updateStateAndStorage(updatedSpots);
        return updatedSpots;
      });
    },
    [updateStateAndStorage]
  );

  // 4. Remover item (pelo placeKey)
  const removeSavedSpot = useCallback(
    (placeKey: string) => {
      setSavedSpots((currentSpots) => {
        const updatedSpots = currentSpots.filter(
          (item) => item.placeKey !== placeKey
        );
        updateStateAndStorage(updatedSpots);
        return updatedSpots;
      });
    },
    [updateStateAndStorage]
  );

  // 5. Limpar todos os spots
  const clearAllSpots = useCallback(() => {
    updateStateAndStorage([]);
  }, [updateStateAndStorage]);

  // 6. Verificar se está salvo
  const isSpotSaved = useCallback(
    (placeKey: string): boolean => {
      return savedSpots.some((item) => item.placeKey === placeKey);
    },
    [savedSpots]
  );

  return {
    savedSpots,
    addSavedSpot,
    removeSavedSpot,
    isSpotSaved,
    clearAllSpots,
  };
}