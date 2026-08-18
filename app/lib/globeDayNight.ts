import * as THREE from 'three';
import { latLonToVector3 } from '@/components/lib/utils';

/**
 * Fonte única do dia e da noite no globo.
 *
 * A textura da Terra e as luzes das cidades são desenhadas por materiais
 * diferentes, mas precisam concordar sobre onde é noite — senão apareceriam
 * luzes acesas no lado iluminado. Por isso as duas contas moram aqui.
 */

/** Modo padrão: acima desta distância o planeta aparece todo de noite. */
export const ZOOM_NIGHT_DISTANCE = 6.5;
/** Modo padrão: abaixo desta distância o planeta aparece todo de dia. */
export const ZOOM_DAY_DISTANCE = 3.5;

/**
 * Faixa do crepúsculo, em produto escalar com a direção do Sol. Estreita de
 * propósito: na Terra real o dia vai claro até quase o terminador.
 */
export const TWILIGHT_START = -0.12;
export const TWILIGHT_END = 0.15;

/** Quanto do dia se vê a esta distância de câmera (0 = noite, 1 = dia). */
export function zoomDaylight(cameraDistance: number): number {
  return (
    1 -
    THREE.MathUtils.smoothstep(
      cameraDistance,
      ZOOM_DAY_DISTANCE,
      ZOOM_NIGHT_DISTANCE,
    )
  );
}

/**
 * Direção do Sol para o horário informado (UTC). O terminador no globo fica
 * onde ele está de verdade agora — num app de notícias isso é informação, não
 * enfeite.
 */
export function sunDirectionForDate(date: Date): THREE.Vector3 {
  const dayOfYear =
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
    86400000;

  // Declinação solar aproximada (±23,44° ao longo do ano).
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365.25);

  // Longitude onde é meio-dia agora: 12h UTC = meridiano de Greenwich.
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const noonLongitude = (12 - utcHours) * 15;

  // Mesma conversão dos rótulos e das fronteiras, para tudo cair nos mesmos eixos.
  return latLonToVector3(declination, noonLongitude, 1).normalize();
}

/** De quanto em quanto tempo vale recalcular o Sol (ele anda ~0,004°/s). */
export const SUN_UPDATE_INTERVAL_MS = 60000;

/** Velocidade do fade ao trocar de modo (evita o corte seco). */
export const MODE_FADE_SPEED = 1.8;
