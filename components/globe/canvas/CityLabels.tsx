'use client';

import React, { FC, useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useCityData, CityWithPosition } from '@/app/hooks/useCityData';
import LabelItem from './LabelItem';

// Cidades só aparecem no zoom máximo (mais perto que os estados).
const CITY_VISIBILITY_THRESHOLD = 1.95;
const MAX_VISIBLE_CITIES = 6;
const DOT_PRODUCT_THRESHOLD = 0.2;
const MIN_SCREEN_DIST = 0.09; // distância mínima em NDC entre etiquetas
const CITY_FONT_SIZE = 0.012;

interface CityLabelsProps {
  cameraDistance: number;
  popupName: string | null;
  openPopup: (name: string) => void;
}

const CityLabels: FC<CityLabelsProps> = ({
  cameraDistance,
  popupName,
  openPopup,
}) => {
  const { camera } = useThree();
  const { cities } = useCityData();
  const [visibleCities, setVisibleCities] = useState<CityWithPosition[]>([]);

  useEffect(() => {
    // Longe demais ou popup aberto → não mostra cidades
    if (popupName || cameraDistance >= CITY_VISIBILITY_THRESHOLD || cities.length === 0) {
      if (visibleCities.length > 0) setVisibleCities([]);
      return;
    }

    const cameraDir = camera.position.clone().normalize();

    const sorted = cities
      .map((city) => ({ city, dot: city.normal.dot(cameraDir) }))
      .filter((c) => c.dot > DOT_PRODUCT_THRESHOLD)
      .sort((a, b) => b.dot - a.dot);

    // Deduplicação em espaço de tela (evita etiquetas sobrepostas)
    const result: CityWithPosition[] = [];
    const occupied: { x: number; y: number }[] = [];

    for (const { city } of sorted) {
      if (result.length >= MAX_VISIBLE_CITIES) break;
      const projected = city.position.clone().project(camera);
      let tooClose = false;
      for (const p of occupied) {
        const dx = projected.x - p.x;
        const dy = projected.y - p.y;
        if (dx * dx + dy * dy < MIN_SCREEN_DIST * MIN_SCREEN_DIST) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        occupied.push({ x: projected.x, y: projected.y });
        result.push(city);
      }
    }

    // Evita re-render se o conjunto não mudou
    const oldKeys = visibleCities.map((c) => c.key).join(',');
    const newKeys = result.map((c) => c.key).join(',');
    if (oldKeys !== newKeys) {
      setVisibleCities(result);
    }
  }, [cities, cameraDistance, camera, camera.position, popupName, visibleCities]);

  if (visibleCities.length === 0) return null;

  return (
    <>
      {visibleCities.map((city) => (
        <LabelItem
          key={city.key}
          position={city.position}
          displayName={city.name}
          onClick={() => openPopup(city.key)}
          isClickable={true}
          fontSize={CITY_FONT_SIZE}
        />
      ))}
    </>
  );
};

export default CityLabels;
