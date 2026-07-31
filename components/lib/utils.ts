// components/lib/utils.ts
'use client';

import * as THREE from 'three';
import { ContentType, CountryContent } from '@/app/types/globe';

/**
 * Converte coordenadas de Latitude e Longitude em um vetor de posição 3D
 * em uma esfera.
 *
 * @param lat Latitude (em graus)
 * @param lon Longitude (em graus)
 * @param radius Raio da esfera
 * @returns THREE.Vector3 Posição 3D
 */
export const latLonToVector3 = (lat: number, lon: number, radius: number): THREE.Vector3 => {
  // Converte graus para radianos
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  // Calcula as coordenadas cartesianas (x, y, z)
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));

  return new THREE.Vector3(x, y, z);
};

/**
 * Converte um vetor de posição 3D na esfera de volta para Latitude/Longitude.
 * É a inversa exata de `latLonToVector3`.
 *
 * @param v Posição 3D na esfera
 * @returns { lat, lon } em graus
 */
export const vector3ToLatLon = (v: THREE.Vector3): { lat: number; lon: number } => {
  const radius = v.length() || 1;
  const phi = Math.acos(THREE.MathUtils.clamp(v.y / radius, -1, 1));
  const lat = 90 - phi * (180 / Math.PI);

  // theta = (lon + 180); recuperado de x = -r sinφ cosθ, z = r sinφ sinθ
  const theta = Math.atan2(v.z, -v.x);
  let lon = theta * (180 / Math.PI) - 180;

  // Normaliza para [-180, 180]
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;

  return { lat, lon };
};

/**
 * Type guard para verificar se o conteúdo é de um país.
 * @param content O objeto de conteúdo a ser verificado.
 * @returns boolean Verdadeiro se for conteúdo de país.
 */
export const isCountryContent = (content: ContentType): content is CountryContent => {
  return (
    (content as CountryContent).nativeLanguage !== undefined &&
    (content as CountryContent).currency !== undefined
  );
};