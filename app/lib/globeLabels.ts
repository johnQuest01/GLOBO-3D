import * as THREE from 'three';

/**
 * Motor de rótulos do globo — modelo "Google Earth".
 *
 * Três ideias sustentam tudo aqui:
 *
 * 1. ZOOM CARTOGRÁFICO (z). A câmera 3D é convertida num nível de zoom de mapa
 *    equivalente. Cada lugar carrega a faixa `minLabel..maxLabel` do Natural
 *    Earth (MIN_LABEL / MAX_LABEL) que diz em que zoom aquele nome deve existir.
 *    É por isso que "Brasil" some quando você entra no estado, e "Belize" não
 *    aparece quando você está olhando o planeta inteiro.
 *
 * 2. FILA ÚNICA. País, estado e cidade disputam o mesmo espaço de tela. O que
 *    decide é a pontuação (importância do lugar + a camada que o zoom favorece),
 *    não a camada em si.
 *
 * 3. COLISÃO EM PIXEL. A disputa usa o retângulo real do texto em pixels de
 *    tela — largura medida na fonte, não estimada por contagem de letras.
 */

export const SPHERE_RADIUS = 1.5;

export type LabelLayer = 'continent' | 'country' | 'state' | 'city';

export interface LabelFeature {
  /** Identificador único e estável (ex: "country:Brazil"). */
  id: string;
  /** Chave usada para abrir o popup de notícias do lugar. */
  popupKey: string;
  name: string;
  layer: LabelLayer;
  position: THREE.Vector3;
  /** Importância cartográfica: 1 = mais importante, 10 = menos. */
  labelRank: number;
  /** Zoom mínimo em que o nome pode aparecer. */
  minLabel: number;
  /** Zoom a partir do qual o nome sai de cena. */
  maxLabel: number;
}

export interface PlacedLabel {
  feature: LabelFeature;
  /** Altura do texto em pixels de tela (o rótulo tem tamanho fixo em tela). */
  fontPx: number;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Medição de texto
// ---------------------------------------------------------------------------

/** Mesma família da fonte usada pelo troika/drei, para a medida bater. */
const MEASURE_FONT_STACK = 'Roboto, "Helvetica Neue", Arial, sans-serif';
const MEASURE_FONT_PX = 100;
/** Folga sobre a medida estimada, até o troika devolver a largura real. */
const MEASURE_SAFETY = 1.04;

const emWidthCache = new Map<string, number>();
let measureContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext;
  if (typeof document === 'undefined') {
    measureContext = null;
    return null;
  }
  const context = document.createElement('canvas').getContext('2d');
  if (context) context.font = `${MEASURE_FONT_PX}px ${MEASURE_FONT_STACK}`;
  measureContext = context;
  return context;
}

/**
 * Largura do texto em múltiplos do fontSize ("em"). Começa como medida do
 * canvas 2D e é substituída pela largura exata assim que o rótulo é desenhado.
 */
export function textEmWidth(text: string): number {
  const cached = emWidthCache.get(text);
  if (cached !== undefined) return cached;

  const context = getMeasureContext();
  const em = context
    ? (context.measureText(text).width / MEASURE_FONT_PX) * MEASURE_SAFETY
    : text.length * 0.58;

  emWidthCache.set(text, em);
  return em;
}

/** Alimentado pelo `onSync` do troika: largura real do texto renderizado. */
export function reportMeasuredEmWidth(text: string, emWidth: number): void {
  if (Number.isFinite(emWidth) && emWidth > 0) {
    emWidthCache.set(text, emWidth);
  }
}

// ---------------------------------------------------------------------------
// Câmera → zoom cartográfico
// ---------------------------------------------------------------------------

/**
 * Converte a câmera num nível de zoom equivalente ao de um mapa (o mesmo
 * "z" das faixas MIN_LABEL/MAX_LABEL do Natural Earth).
 *
 * A conta é: quantos graus de superfície do globo cabem na altura da tela.
 * Quanto menos graus por tela, maior o zoom. Como usa a altura em pixels, uma
 * tela de celular mostra naturalmente menos nomes que um monitor grande.
 */
export function viewZoom(
  cameraDistance: number,
  fovDegrees: number,
  viewportHeightPx: number,
): number {
  const halfFov = THREE.MathUtils.degToRad(fovDegrees / 2);
  const sinHalf = Math.sin(halfFov);
  const cosHalf = Math.cos(halfFov);

  // Interseção do raio da borda da tela com a esfera.
  const discriminant =
    SPHERE_RADIUS * SPHERE_RADIUS -
    cameraDistance * cameraDistance * sinHalf * sinHalf;

  let visibleHalfArc: number;
  if (discriminant <= 0) {
    // O globo inteiro cabe na tela: o limite é o próprio horizonte.
    visibleHalfArc = Math.acos(
      Math.min(1, SPHERE_RADIUS / Math.max(cameraDistance, SPHERE_RADIUS)),
    );
  } else {
    const t = cameraDistance * cosHalf - Math.sqrt(discriminant);
    visibleHalfArc = Math.atan2(t * sinHalf, cameraDistance - t * cosHalf);
  }

  const visibleDegrees = Math.max(
    0.02,
    THREE.MathUtils.radToDeg(visibleHalfArc) * 2,
  );
  const pixelsPerDegree = viewportHeightPx / visibleDegrees;

  return Math.log2((pixelsPerDegree * 360) / 256);
}

// ---------------------------------------------------------------------------
// Prioridade e tamanho
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * O zoom não liga/desliga camadas: ele muda quem tem prioridade na disputa.
 * Longe o peso está nos países; aproximando ele migra para estados e cidades.
 */
function layerRamp(layer: LabelLayer, zoom: number): number {
  switch (layer) {
    case 'continent':
      return 46 * clamp01((3.6 - zoom) / 1.2);
    case 'country':
      return 40 * clamp01((5.6 - zoom) / 2.2);
    case 'state':
      return 32 * clamp01((zoom - 3.2) / 1.6);
    case 'city':
      return 38 * clamp01((zoom - 4.4) / 1.6);
  }
}

/** Bônus para quem já estava na tela — evita nome piscando durante o giro. */
export const STICKY_BONUS = 22;

export function labelScore(
  feature: LabelFeature,
  zoom: number,
  wasVisible: boolean,
): number {
  const importance = (10 - feature.labelRank) * 8;
  const entering = clamp01((zoom - feature.minLabel) / 0.6);
  const leaving = clamp01((feature.maxLabel - zoom) / 0.6);

  return (
    importance +
    layerRamp(feature.layer, zoom) +
    entering * 6 +
    leaving * 6 +
    (wasVisible ? STICKY_BONUS : 0)
  );
}

const LAYER_BASE_PX: Record<LabelLayer, number> = {
  continent: 19,
  country: 15.5,
  state: 13.2,
  city: 12.4,
};

const LAYER_RANK_STEP_PX: Record<LabelLayer, number> = {
  continent: 0,
  country: 1.7,
  state: 0.9,
  city: 0.8,
};

/** Tamanho do texto em pixels de tela: lugar mais importante, nome maior. */
export function labelFontPx(
  feature: LabelFeature,
  viewportShortSidePx: number,
): number {
  const base =
    LAYER_BASE_PX[feature.layer] +
    Math.max(0, 6 - feature.labelRank) * LAYER_RANK_STEP_PX[feature.layer];
  const viewportScale = THREE.MathUtils.clamp(
    viewportShortSidePx / 780,
    0.8,
    1.2,
  );

  return base * viewportScale;
}

/**
 * Escala em unidades de mundo que faz o texto (com `fontSize={1}`) medir
 * exatamente `fontPx` pixels na tela, a qualquer distância.
 */
export function labelWorldScale(
  depth: number,
  fontPx: number,
  fovDegrees: number,
  viewportHeightPx: number,
): number {
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2));
  return (fontPx * 2 * depth * tanHalfFov) / Math.max(1, viewportHeightPx);
}

/** Quantos nomes cabem confortavelmente nesta tela. */
export function maxLabelsForViewport(width: number, height: number): number {
  return THREE.MathUtils.clamp(Math.round((width * height) / 17000), 12, 90);
}

/**
 * Áreas ocupadas pela interface fixa (cabeçalho, coluna de botões, rodapé).
 * Nenhum nome é colocado embaixo delas — em vez de ficar cortado atrás de um
 * botão, o nome cede o lugar para o próximo da fila.
 */
export function uiBlockedRects(width: number, height: number): ScreenRect[] {
  // Cada retângulo cobre só o que é realmente opaco. Generosidade aqui sai
  // caro: medido, a versão anterior reservava metade da tela e os nomes
  // desapareciam em áreas que, para quem olha, estão vazias.
  const railWidth = Math.min(80, Math.max(66, width * 0.1));
  const titleWidth = Math.min(268, width * 0.52);
  const adWidth = Math.min(252, width * 0.5);

  return [
    // Título do topo
    { x: 0, y: 0, width: titleWidth, height: 58 },
    // Seletor Padrão/Relógio, logo abaixo — a faixa entre ele e o título fica
    // livre, em vez de virar um bloco só.
    { x: 0, y: 62, width: Math.min(210, width * 0.42), height: 44 },
    // Botão de menu, no canto superior direito
    { x: width - railWidth, y: 0, width: railWidth, height: 62 },
    // Coluna de botões à direita
    {
      x: width - railWidth,
      y: 66,
      width: railWidth,
      height: Math.max(0, height - 128),
    },
    // Rodapé (créditos, botão "Férias" e cadeado)
    { x: 0, y: height - 58, width, height: 58 },
    // Faixa do anúncio (canto inferior direito)
    {
      x: width - adWidth,
      y: height - 128,
      width: adWidth,
      height: 62,
    },
  ];
}

// ---------------------------------------------------------------------------
// Colocação (declutter)
// ---------------------------------------------------------------------------

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function boxHitsRect(box: Box, rect: ScreenRect): boolean {
  return (
    box.left < rect.x + rect.width &&
    box.right > rect.x &&
    box.top < rect.y + rect.height &&
    box.bottom > rect.y
  );
}

export interface PlacementOptions {
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  zoom: number;
  maxLabels: number;
  /** Ids que estavam visíveis no quadro anterior (histerese). */
  visibleIds: Set<string>;
  blockedRects: ScreenRect[];
}

const HORIZONTAL_GAP_PX = 7;
const VERTICAL_GAP_PX = 5;
/** Quem já está na tela cede um pouco da própria folga para não sair à toa. */
const STICKY_GAP_FACTOR = 0.75;

/**
 * Escolhe, em ordem de prioridade, os nomes que cabem na tela sem se tocar.
 *
 * Só entram lugares que estão de frente para a câmera e dentro da faixa de
 * zoom deles — o outro lado do planeta e as camadas erradas nem são projetados.
 */
export function placeLabels(
  features: LabelFeature[],
  options: PlacementOptions,
): PlacedLabel[] {
  const { camera, width, height, zoom, visibleIds, blockedRects } = options;

  const cameraDistance = camera.position.length();
  if (cameraDistance <= SPHERE_RADIUS) return [];

  // Horizonte real da esfera. O encolhimento é mínimo, só para o nome não
  // nascer exatamente na silhueta: com 8% de corte, medido, 43 nomes por quadro
  // eram descartados aqui — e era o que fazia um nome sumir ao arrastar pouco.
  const horizonAngle = Math.acos(
    Math.min(1, SPHERE_RADIUS / cameraDistance),
  );
  const minDot = Math.cos(horizonAngle * 0.985);

  const cameraDirection = camera.position.clone().normalize();
  const viewportShortSide = Math.min(width, height);

  const ranked: { feature: LabelFeature; score: number; dot: number }[] = [];

  for (const feature of features) {
    if (zoom < feature.minLabel || zoom > feature.maxLabel) continue;

    const dot = feature.position.dot(cameraDirection) / SPHERE_RADIUS;
    if (dot <= minDot) continue;

    ranked.push({
      feature,
      dot,
      score: labelScore(feature, zoom, visibleIds.has(feature.id)),
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.dot - a.dot);

  const placed: PlacedLabel[] = [];
  const boxes: Box[] = [];
  const projected = new THREE.Vector3();

  for (const { feature } of ranked) {
    if (placed.length >= options.maxLabels) break;

    projected.copy(feature.position).project(camera);
    if (projected.z > 1) continue;

    const centerX = (projected.x * 0.5 + 0.5) * width;
    const centerY = (1 - (projected.y * 0.5 + 0.5)) * height;

    const fontPx = labelFontPx(feature, viewportShortSide);
    const sticky = visibleIds.has(feature.id);
    const gapFactor = sticky ? STICKY_GAP_FACTOR : 1;

    const textHalfWidth = (textEmWidth(feature.name) * fontPx) / 2;
    const textHalfHeight = fontPx / 2;

    // Caixa do texto: é ela que precisa caber na tela e ficar longe da interface.
    const textBox: Box = {
      left: centerX - textHalfWidth,
      right: centerX + textHalfWidth,
      top: centerY - textHalfHeight,
      bottom: centerY + textHalfHeight,
    };

    // O nome tem que caber inteiro na tela (nada de texto cortado na borda).
    if (
      textBox.left < 2 ||
      textBox.right > width - 2 ||
      textBox.top < 2 ||
      textBox.bottom > height - 2
    ) {
      continue;
    }

    if (blockedRects.some((rect) => boxHitsRect(textBox, rect))) continue;

    // Caixa de colisão: o texto mais a folga que separa um nome do outro.
    const box: Box = {
      left: textBox.left - HORIZONTAL_GAP_PX * gapFactor,
      right: textBox.right + HORIZONTAL_GAP_PX * gapFactor,
      top: textBox.top - VERTICAL_GAP_PX * gapFactor,
      bottom: textBox.bottom + VERTICAL_GAP_PX * gapFactor,
    };

    if (boxes.some((other) => boxesOverlap(box, other))) continue;

    boxes.push(box);
    placed.push({ feature, fontPx });
  }

  return placed;
}

/**
 * Países cujos "tiles" de estado valem a pena baixar: só os que estão de fato
 * na frente da câmera. Nunca o mundo inteiro.
 */
export function pickVisibleCountries<T extends { position: THREE.Vector3 }>(
  countries: T[],
  camera: THREE.Camera,
  maxCount: number,
): T[] {
  const cameraDistance = camera.position.length();
  if (cameraDistance <= SPHERE_RADIUS) return [];

  const cameraDirection = camera.position.clone().normalize();
  const minDot = SPHERE_RADIUS / cameraDistance;

  return countries
    .map((country) => ({
      country,
      dot: country.position.dot(cameraDirection) / SPHERE_RADIUS,
    }))
    .filter((entry) => entry.dot > minDot)
    .sort((a, b) => b.dot - a.dot)
    .slice(0, maxCount)
    .map((entry) => entry.country);
}

// ---------------------------------------------------------------------------
// Faixas de zoom das camadas (usadas para decidir o que baixar)
// ---------------------------------------------------------------------------

/** Menor `minLabel` que um estado costuma ter no Natural Earth. */
export const STATE_LAYER_ZOOM = 3.2;
/** Zoom a partir do qual as cidades começam a valer a pena. */
export const CITY_LAYER_ZOOM = 4.4;

/** Faixa de zoom de uma cidade, derivada do "rank" editorial (1 = maior). */
export function cityZoomRange(rank: number): { minLabel: number; maxLabel: number } {
  const safeRank = THREE.MathUtils.clamp(Math.round(rank) || 3, 1, 5);
  const minLabel = [4.6, 5.3, 5.8, 6.2, 6.6][safeRank - 1];
  return { minLabel, maxLabel: 24 };
}
