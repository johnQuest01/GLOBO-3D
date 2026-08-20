'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  ContinentLabelData,
  CountryLabelData,
  useCityLabelData,
  useCombinedStateData,
} from '@/app/hooks/useLabelData';
import {
  CITY_LAYER_ZOOM,
  LabelFeature,
  maxLabelsForViewport,
  PlacedLabel,
  pickVisibleCountries,
  placeLabels,
  SPHERE_RADIUS,
  STATE_LAYER_ZOOM,
  uiBlockedRects,
  viewZoom,
} from '@/app/lib/globeLabels';
import { latLonToVector3 } from '@/components/lib/utils';
import LabelItem from './LabelItem';

/** Quantos países podem ter os tiles de estado carregados ao mesmo tempo. */
const MAX_STATE_TILE_COUNTRIES = 14;
/**
 * Tempo que um nome leva sumindo, para não piscar. Curto de propósito: durante
 * o giro o rótulo que está saindo ainda acompanha a câmera e não deve alcançar
 * a borda da tela antes de terminar de sumir.
 */
const FADE_OUT_MS = 150;

interface GlobeLabelsProps {
  continentLabels: ContinentLabelData[];
  countryLabels: CountryLabelData[];
  isLoadingLabels: boolean;
  popupName: string | null;
  isPopupOpen: boolean;
  openPopup: (name: string) => void;
  /**
   * Lugares que já estão marcados com pino. O nome deles sai do globo enquanto
   * o pino está lá — quem diz o nome passa a ser o card azul do pino, e dois
   * rótulos do mesmo lugar no mesmo ponto era o que ficava sujo. Tirar o pino
   * devolve o nome ao globo, porque ele volta a ser candidato normal.
   *
   * Como efeito colateral bem-vindo, o espaço que o nome ocupava fica livre
   * para o próximo da fila.
   */
  pinnedKeys: Set<string>;
}

/** Um rótulo na tela; `active: false` significa que está saindo (fade out). */
interface RenderedLabel {
  placed: PlacedLabel;
  active: boolean;
}

const GlobeLabels: FC<GlobeLabelsProps> = ({
  continentLabels,
  countryLabels,
  isLoadingLabels,
  popupName,
  isPopupOpen,
  openPopup,
  pinnedKeys,
}) => {
  const { camera, size } = useThree();
  const [rendered, setRendered] = useState<RenderedLabel[]>([]);
  const [tileCountryKeys, setTileCountryKeys] = useState<string[]>([]);
  /** Passo de zoom arredondado: muda pouco, evita re-render a cada quadro. */
  const [zoomStep, setZoomStep] = useState(0);

  const visibleIdsRef = useRef<Set<string>>(new Set());
  const exitTimersRef = useRef(new Map<string, number>());
  /** Última câmera avaliada: com o globo parado não há trabalho por quadro. */
  const lastCameraRef = useRef(new THREE.Vector3(Infinity, 0, 0));
  const needsPlacementRef = useRef(true);

  // --- Camadas fixas: continentes e países -------------------------------
  const baseFeatures = useMemo<LabelFeature[]>(() => {
    const continents = continentLabels.map<LabelFeature>((label) => ({
      id: `continent:${label.key}`,
      popupKey: label.key,
      name: label.name,
      layer: 'continent',
      position: latLonToVector3(label.lat, label.lon, SPHERE_RADIUS),
      labelRank: label.labelRank,
      minLabel: label.minLabel,
      maxLabel: label.maxLabel,
    }));

    const countries = countryLabels.map<LabelFeature>((label) => ({
      id: `country:${label.key}`,
      popupKey: label.key,
      name: label.name,
      layer: 'country',
      position: latLonToVector3(label.lat, label.lon, SPHERE_RADIUS),
      labelRank: label.labelRank,
      minLabel: label.minLabel,
      maxLabel: label.maxLabel,
    }));

    return [...continents, ...countries];
  }, [continentLabels, countryLabels]);

  // --- Camadas sob demanda: estados e cidades -----------------------------
  const zoom = zoomStep / 20;
  const statesEnabled = !isPopupOpen && zoom >= STATE_LAYER_ZOOM;
  const citiesEnabled = !isPopupOpen && zoom >= CITY_LAYER_ZOOM;

  // Estados e cidades saem dos MESMOS países visíveis: é a mesma pergunta
  // ("o que está de frente para a câmera"), feita uma vez só.
  const { combinedStates } = useCombinedStateData(tileCountryKeys, statesEnabled);
  const { cityLabels } = useCityLabelData(tileCountryKeys, citiesEnabled);

  const stateFeatures = useMemo<LabelFeature[]>(
    () =>
      combinedStates.map((state) => ({
        id: `state:${state.countryKey}:${state.key}`,
        popupKey: state.key,
        name: state.name,
        layer: 'state',
        position: state.position,
        labelRank: state.labelRank,
        minLabel: state.minLabel,
        maxLabel: state.maxLabel,
      })),
    [combinedStates],
  );

  const cityFeatures = useMemo<LabelFeature[]>(
    () =>
      cityLabels.map((city) => ({
        id: `city:${city.key}`,
        popupKey: city.key,
        name: city.name,
        layer: 'city',
        position: city.position,
        // Importância e faixa de zoom vêm prontas do tile: para as cidades do
        // Natural Earth são o SCALERANK e o MIN_ZOOM dele; para as curadas do
        // projeto, a tabela de rank aplicada na geração.
        labelRank: city.labelRank,
        minLabel: city.minLabel,
        maxLabel: city.maxLabel,
      })),
    [cityLabels],
  );

  const features = useMemo(() => {
    const todos = [...baseFeatures, ...stateFeatures, ...cityFeatures];
    if (pinnedKeys.size === 0) return todos;
    return todos.filter((feature) => !pinnedKeys.has(feature.popupKey));
  }, [baseFeatures, stateFeatures, cityFeatures, pinnedKeys]);

  const blockedRects = useMemo(
    () => uiBlockedRects(size.width, size.height),
    [size.width, size.height],
  );
  const maxLabels = useMemo(
    () => maxLabelsForViewport(size.width, size.height),
    [size.width, size.height],
  );

  // Dados novos, tela redimensionada ou popup fechado: refaz a colocação mesmo
  // que a câmera não tenha se mexido.
  useEffect(() => {
    needsPlacementRef.current = true;
  }, [features, blockedRects, maxLabels, isPopupOpen, popupName, isLoadingLabels]);

  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /** Remove de vez um rótulo depois que ele terminou de sumir. */
  const scheduleRemoval = useCallback((id: string) => {
    if (exitTimersRef.current.has(id)) return;
    const timer = window.setTimeout(() => {
      exitTimersRef.current.delete(id);
      setRendered((prev) => prev.filter((item) => item.active || item.placed.feature.id !== id));
    }, FADE_OUT_MS);
    exitTimersRef.current.set(id, timer);
  }, []);

  useFrame(() => {
    if (isPopupOpen || isLoadingLabels || popupName) {
      if (visibleIdsRef.current.size > 0) {
        visibleIdsRef.current = new Set();
        setRendered([]);
      }
      return;
    }

    const perspective = camera as THREE.PerspectiveCamera;

    // Com o globo parado (e nada novo carregado) não há o que recalcular.
    const cameraMoved =
      perspective.position.distanceToSquared(lastCameraRef.current) > 1e-8;
    if (!cameraMoved && !needsPlacementRef.current) return;
    lastCameraRef.current.copy(perspective.position);
    needsPlacementRef.current = false;

    const currentZoom = viewZoom(
      perspective.position.length(),
      perspective.fov ?? 50,
      size.height,
    );

    // Só re-avalia as camadas de dados quando o zoom muda de verdade.
    const nextZoomStep = Math.round(currentZoom * 20);
    if (nextZoomStep !== zoomStep) setZoomStep(nextZoomStep);

    // Quais países estão de frente para a câmera (para baixar os tiles certos).
    if (currentZoom >= STATE_LAYER_ZOOM) {
      const visible = pickVisibleCountries(
        baseFeatures.filter((feature) => feature.layer === 'country'),
        perspective,
        MAX_STATE_TILE_COUNTRIES,
      )
        .map((feature) => feature.popupKey)
        // Ordem fixa: girar o globo não deve trocar a lista só de posição.
        .sort();

      setTileCountryKeys((prev) =>
        prev.length === visible.length && prev.every((key, i) => key === visible[i])
          ? prev
          : visible,
      );
    } else if (tileCountryKeys.length > 0) {
      setTileCountryKeys([]);
    }

    const placed = placeLabels(features, {
      camera: perspective,
      width: size.width,
      height: size.height,
      zoom: currentZoom,
      maxLabels,
      visibleIds: visibleIdsRef.current,
      blockedRects,
    });

    const nextIds = new Set(placed.map((item) => item.feature.id));
    const previousIds = visibleIdsRef.current;

    let changed = nextIds.size !== previousIds.size;
    if (!changed) {
      for (const id of nextIds) {
        if (!previousIds.has(id)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    visibleIdsRef.current = nextIds;

    setRendered((prev) => {
      const leaving = prev.filter(
        (item) => item.active && !nextIds.has(item.placed.feature.id),
      );
      for (const item of leaving) scheduleRemoval(item.placed.feature.id);

      const stillFading = prev.filter(
        (item) => !nextIds.has(item.placed.feature.id),
      );

      return [
        ...placed.map((item) => ({ placed: item, active: true })),
        ...stillFading.map((item) => ({ ...item, active: false })),
      ];
    });
  });

  if (rendered.length === 0) return null;

  return (
    <>
      {rendered.map(({ placed, active }) => (
        <LabelItem
          key={placed.feature.id}
          position={placed.feature.position}
          displayName={placed.feature.name}
          fontPx={placed.fontPx}
          offsetEmX={placed.offsetEmX}
          offsetEmY={placed.offsetEmY}
          layer={placed.feature.layer}
          visible={active}
          onClick={() => openPopup(placed.feature.popupKey)}
          isClickable={active}
        />
      ))}
    </>
  );
};

export default GlobeLabels;
