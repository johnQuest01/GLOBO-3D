'use client';

import React, { useMemo } from 'react';
import Airplane from './Airplane';
import { AIRLINES } from '@/components/globe/config/airlines';
import { latLonToVector3 } from '@/components/lib/utils';

const SPHERE_RADIUS = 1.5;

// Principais hubs aéreos (lat, lon)
const HUBS: Record<string, { lat: number; lon: number }> = {
  GRU: { lat: -23.55, lon: -46.63 }, // São Paulo
  JFK: { lat: 40.64, lon: -73.78 }, // Nova York
  LHR: { lat: 51.47, lon: -0.45 }, // Londres
  CDG: { lat: 49.0, lon: 2.55 }, // Paris
  DXB: { lat: 25.25, lon: 55.36 }, // Dubai
  DOH: { lat: 25.27, lon: 51.61 }, // Doha
  HND: { lat: 35.55, lon: 139.78 }, // Tóquio
  SYD: { lat: -33.94, lon: 151.18 }, // Sydney
  JNB: { lat: -26.13, lon: 28.24 }, // Joanesburgo
  LAX: { lat: 33.94, lon: -118.4 }, // Los Angeles
  FRA: { lat: 50.03, lon: 8.57 }, // Frankfurt
};

// Rotas de marketing: cada avião voa continuamente entre dois hubs.
const ROUTES: {
  from: keyof typeof HUBS;
  to: keyof typeof HUBS;
  airline: string;
  delay: number;
}[] = [
  { from: 'GRU', to: 'LHR', airline: 'latam', delay: 0 },
  { from: 'JFK', to: 'CDG', airline: 'american', delay: 2.5 },
  { from: 'DXB', to: 'HND', airline: 'emirates', delay: 5 },
  { from: 'DOH', to: 'SYD', airline: 'qatar', delay: 1.5 },
  { from: 'CDG', to: 'JFK', airline: 'airfrance', delay: 4 },
  { from: 'GRU', to: 'JNB', airline: 'gol', delay: 3 },
  { from: 'FRA', to: 'LAX', airline: 'lufthansa', delay: 6 },
];

const MarketingFleet: React.FC = () => {
  const flights = useMemo(() => {
    return ROUTES.map((route) => {
      const from = HUBS[route.from];
      const to = HUBS[route.to];
      return {
        id: `${route.from}-${route.to}-${route.airline}`,
        start: latLonToVector3(from.lat, from.lon, SPHERE_RADIUS),
        end: latLonToVector3(to.lat, to.lon, SPHERE_RADIUS),
        airline: AIRLINES[route.airline],
        delay: route.delay,
      };
    });
  }, []);

  return (
    <>
      {flights.map((flight) => (
        <Airplane
          key={flight.id}
          startVec={flight.start}
          endVec={flight.end}
          airline={flight.airline}
          startDelay={flight.delay}
        />
      ))}
    </>
  );
};

export default MarketingFleet;
