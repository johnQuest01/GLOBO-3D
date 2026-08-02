'use client';

import React, { FC, useMemo } from 'react';
import * as THREE from 'three';
import { AdData } from '@/app/types/globe';
import AdMarker from './AdMarker';
import { useDbAds } from '@/app/hooks/useDbAds';
import { useUserInterests } from '@/app/hooks/useUserInterests';
import { useGeoMapping } from '@/app/hooks/useGeoMapping';
import { latLonToVector3 } from '@/components/lib/utils';

const SPHERE_RADIUS = 1.5;
const AD_IMAGE_FALLBACK =
  'https://placehold.co/100x64/1E293B/FBBF24?text=Ad';

/**
 * Renderiza os anúncios vindos do banco (Neon) como marcadores no globo.
 * Cada anúncio é posicionado por lat/lon (ou, na falta, pela chave da região).
 * Complementa o sistema de anúncios locais criados pelo usuário.
 */
const DbAds: FC = () => {
  const { interests } = useUserInterests();
  const { ads } = useDbAds(interests);
  const { keyToVector3, isLoading: isLoadingGeo } = useGeoMapping();

  const positioned = useMemo(() => {
    return ads
      .map((ad) => {
        let position: THREE.Vector3 | null = null;
        if (typeof ad.lat === 'number' && typeof ad.lon === 'number') {
          position = latLonToVector3(ad.lat, ad.lon, SPHERE_RADIUS);
        } else if (ad.region_key) {
          position = keyToVector3(ad.region_key, SPHERE_RADIUS);
        }
        if (!position) return null;

        const adData: AdData = {
          id: `db-${ad.id}`,
          title: ad.title,
          imageUrl: ad.image_url || AD_IMAGE_FALLBACK,
          websiteUrl: ad.link_url || '#',
          layer: 'layer1',
          locationKey: ad.region_key || '',
        };
        return { position, adData };
      })
      .filter((x): x is { position: THREE.Vector3; adData: AdData } => x !== null);
  }, [ads, keyToVector3]);

  if (isLoadingGeo || positioned.length === 0) return null;

  return (
    <group>
      {positioned.map(({ position, adData }) => (
        <AdMarker key={adData.id} position={position} adData={adData} />
      ))}
    </group>
  );
};

export default DbAds;
