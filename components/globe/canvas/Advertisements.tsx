// components/globe/canvas/Advertisements.tsx
'use client';

import React, { FC } from 'react';
import * as THREE from 'three';
import { AdData } from '@/app/types/globe';
import AdMarker from './AdMarker'; // Import the individual marker component
import { useGeoMapping } from '@/app/hooks/useGeoMapping'; // Import the hook to get coordinates

interface AdvertisementsProps {
  ads: AdData[];
}

const SPHERE_RADIUS = 1.5; // Make sure this matches your globe's radius

const Advertisements: FC<AdvertisementsProps> = ({ ads }) => {
  const { keyToVector3, isLoading: isLoadingGeoMapping } = useGeoMapping();

  // Don't render anything if the mapping is still loading or there are no ads
  if (isLoadingGeoMapping || ads.length === 0) {
    return null;
  }

  return (
    <group>
      {ads.map((ad) => {
        // Use the hook to convert the ad's locationKey to 3D coordinates
        const position = keyToVector3(ad.locationKey, SPHERE_RADIUS);

        // Only render the AdMarker if we successfully found the position
        if (position) {
          return <AdMarker key={ad.id} position={position} adData={ad} />;
        } else {
          // Log a warning if a location key couldn't be mapped
          // console.warn(`[Advertisements] Could not find position for ad locationKey: "${ad.locationKey}"`);
          return null; // Don't render if position is not found
        }
      })}
    </group>
  );
};

export default Advertisements;