// scripts/preprocess-data.mjs
// ESTA É A VERSÃO ATUALIZADA COM A LÓGICA DE "TILING" (FATIAMENTO)

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

// --- Configuração de Caminhos ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const dataDir = path.resolve(publicDir, 'data');
const texturesDir = path.resolve(publicDir, 'textures');
const translationsDir = path.resolve(publicDir, 'translations');

// --- NOVO: Caminho para os "tiles" de estados ---
const stateLabelsTiledDir = path.resolve(dataDir, 'state-labels-tiled');

// --- Funções Auxiliares GeoJSON (Inalteradas) ---
function getGeoJsonCentroid(geometry) {
  let coords = [];
  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    const largestPolygon = geometry.coordinates.reduce(
      (a, b) => (a[0].length > b[0].length ? a : b),
      [[]],
    );
    coords = largestPolygon[0];
  } else {
    return { lat: 0, lon: 0 };
  }
  if (!coords || coords.length === 0) {
    return { lat: 0, lon: 0 };
  }
  let latSum = 0;
  let lonSum = 0;
  coords.forEach(([lon, lat]) => {
    lonSum += lon;
    latSum += lat;
  });
  return { lat: latSum / coords.length, lon: lonSum / coords.length };
}

const getNameFromProperties = (props) => {
  const nameKeys = [
    'name', 'NAME', 'ADMIN', 'sovereignt', 'name_long', 'formal_en',
  ];
  for (const key of nameKeys) {
    if (props && typeof props[key] === 'string') {
      return props[key];
    }
  }
  return `feature_${Math.random()}`;
};

// Função para extrair o continente
const getContinentFromProperties = (props) => {
  const continentKeys = ['CONTINENT', 'continent']; // Chaves comuns
  for (const key of continentKeys) {
    if (props && typeof props[key] === 'string') {
      return props[key];
    }
  }
  // Fallback se não encontrar
  return 'Unknown';
};

/**
 * O Natural Earth já traz a "cartografia de rótulos" pronta em cada feature:
 * quem é importante (LABELRANK), em que faixa de zoom o nome deve existir
 * (MIN_LABEL / MAX_LABEL) e onde encostar o texto (LABEL_X / LABEL_Y).
 * É esse conjunto que o globo usa para decidir o que mostrar em cada zoom.
 */
const numberOr = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) && value > -99
    ? value
    : fallback;

const getLabelMetadata = (props, defaults) => ({
  labelRank: Math.round(
    numberOr(props?.LABELRANK ?? props?.labelrank, defaults.labelRank),
  ),
  minLabel: numberOr(props?.MIN_LABEL ?? props?.min_label, defaults.minLabel),
  maxLabel: numberOr(props?.MAX_LABEL ?? props?.max_label, defaults.maxLabel),
});

/** Ponto de ancoragem do nome, já ajustado pelo Natural Earth. */
const getLabelAnchor = (props) => {
  const lon = props?.LABEL_X ?? props?.longitude;
  const lat = props?.LABEL_Y ?? props?.latitude;
  if (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  ) {
    return { lat, lon };
  }
  return null;
};

/** Nome exibido: tradução manual do projeto > nome em português do NE > original. */
const getDisplayName = (translations, originalName, props) =>
  translations[originalName] || props?.NAME_PT || props?.name_pt || originalName;

// (Função inalterada)
const getCountryNameFromStateProperties = (props) => {
  const countryKeys = [
    'ADMIN',        // Chave antiga (maiúscula)
    'SOVEREIGNT',
    'COUNTRY',
    'country_name',
    'admin'          // Chave 'admin' (minúscula)
  ];
  for (const key of countryKeys) {
    if (props && typeof props[key] === 'string') {
      return props[key];
    }
  }
  console.warn(`AVISO: Não foi possível encontrar o país para o estado: ${props.name || 'Nome desconhecido'}`);
  return 'Unknown'; // Fallback
}


/**
 * ETAPA 1: Processa os arquivos de dados para gerar os JSONs otimizados.
 */
async function processDataFiles() {
  console.log('Iniciando Etapa 1: Processamento de Dados JSON...');

  // --- 1. Inicializa Estruturas de Dados (Inalterado) ---
  const geoMapping = {};
  const flightLocations = [];
  const countryLabels = [];
  const countryLabelNames = new Set();
  const stateLabelsTiled = {}; 

  try {
    // --- 2. Carregar Arquivos de Entrada (Inalterado) ---
    console.log('Carregando arquivos de entrada...');
    const contentPath = path.resolve(dataDir, 'content.json');
    const countriesPath = path.resolve(dataDir, 'countries.geojson');
    const statesPath = path.resolve(dataDir, 'states.geojson');
    const translationsPath = path.resolve(translationsDir, 'pt.json');

    const contentData = JSON.parse(await fs.readFile(contentPath, 'utf-8'));
    const countriesData = JSON.parse(await fs.readFile(countriesPath, 'utf-8'));
    const statesData = JSON.parse(await fs.readFile(statesPath, 'utf-8'));
    const translations = JSON.parse(await fs.readFile(translationsPath, 'utf-8'));
    console.log('Arquivos carregados.');

    // --- (Limpeza do diretório 'state-labels-tiled' - Inalterado) ---
    await fs.mkdir(stateLabelsTiledDir, { recursive: true });
    const oldFiles = await fs.readdir(stateLabelsTiledDir);
    for (const file of oldFiles) {
      await fs.unlink(path.join(stateLabelsTiledDir, file));
    }

    // --- 3. Processar content.json (Inalterado) ---
    // (Este passo popula o geoMapping com "Brazil", "USA", "são paulo", etc.)
    console.log('Processando content.json...');
    for (const [key, entry] of Object.entries(contentData)) {
      if (key === 'default') continue;
      if (entry.latitude && entry.longitude) {
        const name = translations[key] || key;
        geoMapping[key] = { lat: entry.latitude, lon: entry.longitude };
        flightLocations.push({
          key: key,
          name: name,
          lat: entry.latitude,
          lon: entry.longitude,
        });
      }
    }

    // --- 4. Processar states.geojson (Inalterado) ---
    // (Este passo lê "são paulo" e encontra no geoMapping)
    console.log('Processando states.geojson para "tiling"...');
    for (const feature of statesData.features) {
      const stateName = getNameFromProperties(feature.properties); // Ex: "São Paulo"
      const stateKey = stateName.toLowerCase(); // Ex: "são paulo"
      const stateDisplayName = getDisplayName(
        translations,
        stateName,
        feature.properties,
      );
      const countryName = getCountryNameFromStateProperties(feature.properties);

      if (countryName === 'Unknown') continue; 

      if (countryName === 'Spain' && stateName !== 'Valencia') {
        continue; 
      }
      
      if (!stateLabelsTiled[countryName]) {
        stateLabelsTiled[countryName] = [];
      }

      let lat, lon;
      // Procura por "são paulo" (minúsculo), o que está correto
      if (geoMapping[stateKey]) {
        lat = geoMapping[stateKey].lat;
        lon = geoMapping[stateKey].lon;
      } else {
        // Ancoragem do Natural Earth quando existir; centroide só como último caso
        // (o centroide de estados recortados costuma cair fora do território).
        const anchor =
          getLabelAnchor(feature.properties) ??
          getGeoJsonCentroid(feature.geometry);
        lat = anchor.lat;
        lon = anchor.lon;
        geoMapping[stateKey] = { lat, lon };
        flightLocations.push({ key: stateKey, name: stateDisplayName, lat, lon });
      }

      stateLabelsTiled[countryName].push({
        name: stateDisplayName,
        key: stateKey,
        lat,
        lon,
        ...getLabelMetadata(feature.properties, {
          labelRank: 5,
          minLabel: 4.2,
          maxLabel: 9,
        }),
      });
    }

    // --- 5. Processar countries.geojson (PARA RÓTULOS DE PAÍSES) ---
    // --- (INÍCIO DA CORREÇÃO) ---
    console.log('Processando countries.geojson...');
    for (const feature of countriesData.features) {
      const name = getNameFromProperties(feature.properties); // Ex: "Brazil" (Maiúscula)
      const continent = getContinentFromProperties(feature.properties);
      const key_lowercase = name.toLowerCase(); // Ex: "brazil" (Minúscula)
      const displayName = getDisplayName(translations, name, feature.properties);

      if (countryLabelNames.has(displayName)) {
        continue;
      }

      let lat, lon;
      
      // 1. Procura pela chave exata do content.json (ex: "Brazil" ou "USA")
      if (geoMapping[name]) {
        lat = geoMapping[name].lat;
        lon = geoMapping[name].lon;
      } 
      // 2. Procura pela chave minúscula (ex: "brazil")
      else if (geoMapping[key_lowercase]) {
        lat = geoMapping[key_lowercase].lat;
        lon = geoMapping[key_lowercase].lon;
      } 
      // 3. Se não achar, usa a ancoragem do Natural Earth (centroide só no pior caso)
      else {
        const anchor =
          getLabelAnchor(feature.properties) ??
          getGeoJsonCentroid(feature.geometry);
        lat = anchor.lat;
        lon = anchor.lon;
        // Salva no geoMapping pela chave minúscula como fallback
        geoMapping[key_lowercase] = { lat, lon };
        // Adiciona no flightLocations pela chave minúscula
        flightLocations.push({ key: key_lowercase, name: displayName, lat, lon });
      }

      countryLabels.push({
        name: displayName, // Nome traduzido (Ex: "Brasil")
        key: name,         // Chave original (Ex: "Brazil")
        lat,
        lon,
        continent: continent, // Adiciona o continente
        ...getLabelMetadata(feature.properties, {
          labelRank: 4,
          minLabel: 2.5,
          maxLabel: 7,
        }),
      });
      countryLabelNames.add(displayName);
    }
    // --- (FIM DA CORREÇÃO) ---


    // --- 5b. Rótulos de continente (o degrau mais distante do zoom) ---
    // As coordenadas vêm do content.json, onde já foram centralizadas à mão.
    // O countries.geojson não traz continentes, então o nome em português vem
    // daqui (a tradução manual do projeto continua tendo prioridade).
    const CONTINENT_NAMES_PT = {
      Africa: 'África',
      Europe: 'Europa',
      Asia: 'Ásia',
      'North America': 'América do Norte',
      'South America': 'América do Sul',
      Oceania: 'Oceania',
      Antarctica: 'Antártida',
    };
    const continentLabels = Object.keys(CONTINENT_NAMES_PT)
      .filter((key) => geoMapping[key])
      .map((key) => ({
        name: translations[key] || CONTINENT_NAMES_PT[key],
        key,
        lat: geoMapping[key].lat,
        lon: geoMapping[key].lon,
        labelRank: 1,
        minLabel: 0,
        // Some quando os países assumem a tela.
        maxLabel: 3.6,
      }));

    // --- 6. Ordenar flightLocations (sem alteração) ---
    flightLocations.sort((a, b) => a.name.localeCompare(b.name));

    // --- 7. Salvar Arquivos de Saída (Inalterado) ---
    console.log('Salvando arquivos JSON processados...');
    await fs.writeFile(
      path.resolve(dataDir, 'geo-mapping.json'),
      JSON.stringify(geoMapping, null, 2),
    );
    await fs.writeFile(
      path.resolve(dataDir, 'flight-locations.json'),
      JSON.stringify(flightLocations, null, 2),
    );
    await fs.writeFile(
      path.resolve(dataDir, 'country-labels.json'),
      JSON.stringify(countryLabels, null, 2),
    );
    await fs.writeFile(
      path.resolve(dataDir, 'continent-labels.json'),
      JSON.stringify(continentLabels, null, 2),
    );

    // (Remoção do state-labels.json obsoleto - Inalterado)
    try {
      await fs.unlink(path.resolve(dataDir, 'state-labels.json'));
      console.log('Arquivo state-labels.json obsoleto removido.');
    } catch (e) {
      // Ignora se o arquivo não existir
    }

    // (Salva os arquivos de estados "fatiados" - Inalterado)
    console.log(`Salvando ${Object.keys(stateLabelsTiled).length} arquivos de estados fatiados...`);
    for (const [countryKey, states] of Object.entries(stateLabelsTiled)) {
      const countryFileName = `${countryKey}.json`; // Ex: "Brazil.json"
      const filePath = path.resolve(stateLabelsTiledDir, countryFileName);
      await fs.writeFile(filePath, JSON.stringify(states, null, 2));
    }

    console.log(
      `\x1b[32m✔ Sucesso! Etapa 1 concluída. JSONs otimizados e tiles de estados salvos.  \x1b[0m`,
    );
  } catch (error) {
    console.error(
      `\x1b[31mErro durante o processamento JSON: ${error.message}\x1b[0m`,
    );
    console.error(error.stack);
    process.exit(1);
  }
}


// ---------------------------------------------------------------------------
// ETAPA 2: Fronteiras em vetor
//
// Antes as fronteiras eram pintadas dentro da textura (gerando um PNG de 89 MB
// e linhas que sumiam no zoom longe e ficavam de 1px no zoom perto). Agora saem
// como linhas de verdade, desenhadas em cima do globo: espessura constante em
// qualquer zoom e nenhum peso na textura.
// ---------------------------------------------------------------------------

/** Casas decimais guardadas (4 ≈ 11 m — bem além do que a fonte 110m resolve). */
const BORDER_PRECISION = 4;

/**
 * Achata um GeoJSON em anéis de coordenadas: [[lon, lat, lon, lat, ...], ...].
 * Um anel vira uma linha contínua no globo.
 */
function extractBorderRings(geojson) {
  const rings = [];
  const round = (n) => Number(n.toFixed(BORDER_PRECISION));

  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];

    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;
        const flat = [];
        for (const [lon, lat] of ring) {
          flat.push(round(lon), round(lat));
        }
        rings.push(flat);
      }
    }
  }

  return rings;
}

async function generateBorderLines() {
  console.log('Iniciando Etapa 2: Extração das fronteiras em vetor...');
  try {
    const sources = [
      { in: 'countries.geojson', out: 'borders-countries.json' },
      { in: 'states.geojson', out: 'borders-states.json' },
    ];

    for (const { in: inFile, out: outFile } of sources) {
      const inPath = path.resolve(dataDir, inFile);
      try {
        await fs.access(inPath);
      } catch {
        console.warn(`\x1b[33mAviso: ${inFile} não encontrado, pulando.\x1b[0m`);
        continue;
      }

      const geojson = JSON.parse(await fs.readFile(inPath, 'utf-8'));
      const rings = extractBorderRings(geojson);
      const vertices = rings.reduce((sum, ring) => sum + ring.length / 2, 0);

      const outPath = path.resolve(dataDir, outFile);
      await fs.writeFile(outPath, JSON.stringify({ rings }));

      const sizeKb = ((await fs.stat(outPath)).size / 1024).toFixed(0);
      console.log(
        `  ${outFile}: ${rings.length} linhas, ${vertices} vértices, ${sizeKb} KB`,
      );
    }

    console.log('\x1b[32m✔ Sucesso! Etapa 2 concluída. Fronteiras em vetor salvas.\x1b[0m');
  } catch (error) {
    console.error(`\x1b[31mErro ao extrair fronteiras: ${error.message}\x1b[0m`);
    console.error(error.stack);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// ETAPA 3: Texturas do globo
//
// UMA única imagem de origem (earth-1.png, 16200x8100) para tudo: todos os
// níveis de zoom e também a noite. O lado noturno é essa mesma textura
// escurecida no shader — não existe segunda imagem para o navegador baixar.
// ---------------------------------------------------------------------------

const DAY_SOURCE = path.resolve(texturesDir, 'earth-1.png');

/** Níveis de LOD do dia. `maxDistance` é a distância da câmera em que cada um assume. */
const DAY_LEVELS = [
  { width: 2048, quality: 82, out: 'earth-day-2k.webp' },
  { width: 4096, quality: 80, out: 'earth-day-4k.webp' },
  { width: 8192, quality: 78, out: 'earth-day-8k.webp' },
];

async function generateEarthTextures() {
  console.log('Iniciando Etapa 3: Geração das texturas do globo...');
  try {
    await fs.access(DAY_SOURCE);
  } catch {
    console.error(
      `\x1b[31mErro: textura de origem não encontrada: ${DAY_SOURCE}\x1b[0m`,
    );
    process.exit(1);
  }

  try {
    for (const { width, quality, out } of DAY_LEVELS) {
      const outPath = path.resolve(texturesDir, out);
      console.log(`  Gerando ${out} (${width}px)...`);
      await sharp(DAY_SOURCE, { limitInputPixels: false })
        .resize(width, width / 2, { fit: 'fill' })
        .webp({ quality, effort: 4 })
        .toFile(outPath);
      const sizeKb = ((await fs.stat(outPath)).size / 1024).toFixed(0);
      console.log(`    ${out}: ${sizeKb} KB`);
    }

    console.log('\x1b[32m✔ Sucesso! Etapa 3 concluída. Texturas salvas.\x1b[0m');
  } catch (error) {
    console.error(`\x1b[31mErro ao gerar texturas: ${error.message}\x1b[0m`);
    console.error(error.stack);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// ETAPA 4: Luzes das cidades, como pontos
//
// A imagem noturna de satélite é lida AQUI, uma vez, na máquina de
// desenvolvimento — e nunca vai para o navegador. O que o usuário baixa é a
// lista de coordenadas dos pontos luminosos.
//
// Isso troca uma textura de 2048x1024 (8 MB de memória de GPU, mais uma
// amostragem por pixel a cada quadro) por alguns milhares de vértices num
// único draw call, sem textura nenhuma. É o caminho leve para celular fraco, e
// as luzes continuam reais: saem de onde há cidade de verdade.
// ---------------------------------------------------------------------------

const LIGHTS_SOURCE = path.resolve(rootDir, 'img', 'noite.jpg');

/**
 * Abaixo disso é solo escuro, não cidade.
 *
 * Calibrado por região: em 45 a América do Sul e a África ficavam
 * sub-representadas, porque a luz delas é mais fraca que a dos EUA e da Europa
 * e um limiar global as cortava desproporcionalmente. Em 36, Amazônia, Saara e
 * Sibéria seguem praticamente vazios — a prova de que não é ruído de terreno.
 * Abaixo de 32 o fundo de continente começa a vazar.
 *
 * Reconferir com: `node scripts/preview-lights.mjs`
 */
const LIGHT_THRESHOLD = 36;

/**
 * UM pixel aceso vira UMA luz.
 *
 * A versão anterior agrupava em blocos 2x2 e depois multiplicava os blocos
 * fortes para simular adensamento — perdia 37% do detalhe da imagem e inventava
 * pontos que não existiam nela. Amostrando pixel a pixel, a densidade vem da
 * própria foto: onde a mancha urbana é contínua saem muitos pontos pequenos
 * colados, e onde há cidade isolada sai um ponto só. É o que faz o resultado
 * ficar fiel em vez de parecer carimbado.
 */
async function generateCityLights() {
  console.log('Iniciando Etapa 4: Extração das luzes das cidades...');

  try {
    await fs.access(LIGHTS_SOURCE);
  } catch {
    console.warn(
      `[33mAviso: ${LIGHTS_SOURCE} não encontrado. O globo fica sem luzes noturnas.[0m`,
    );
    return;
  }

  try {
    const image = sharp(LIGHTS_SOURCE);
    const meta = await image.metadata();
    const raw = await image.raw().toBuffer();
    const channels = raw.length / (meta.width * meta.height);

    const lons = [];
    const lats = [];
    const intensities = [];

    for (let y = 0; y < meta.height; y++) {
      const lat = 90 - ((y + 0.5) / meta.height) * 180;
      if (Math.abs(lat) > 80) continue;

      for (let x = 0; x < meta.width; x++) {
        const i = (y * meta.width + x) * channels;
        const brightness = Math.max(raw[i], raw[i + 1], raw[i + 2]);
        if (brightness < LIGHT_THRESHOLD) continue;

        // Folga aleatória de quase um pixel. Sem ela as luzes herdam a grade
        // da imagem: no zoom máximo dois pixels vizinhos da fonte ficam a ~18px
        // de distância na tela, e o quadriculado salta aos olhos. O
        // deslocamento cabe dentro da vizinhança do próprio pixel, então
        // nenhuma luz sai de onde existe cidade.
        const jx = (Math.random() - 0.5) * 1.8;
        const jy = (Math.random() - 0.5) * 1.8;

        const lon = ((x + 0.5 + jx) / meta.width) * 360 - 180;
        const jlat = 90 - ((y + 0.5 + jy) / meta.height) * 180;

        // Faixa dinâmica larga: poucos núcleos fortíssimos e uma multidão de
        // pontinhos fracos, como na foto. Comprimir isso é o que fazia tudo
        // parecer do mesmo tamanho.
        const normalized = (brightness - LIGHT_THRESHOLD) / (255 - LIGHT_THRESHOLD);
        const intensity = 0.10 + 0.90 * Math.pow(normalized, 0.75);

        lons.push(Math.round(lon * 100));
        lats.push(Math.round(jlat * 100));
        intensities.push(Math.round(intensity * 255));
      }
    }

    const count = lons.length;

    // Binário em vez de JSON: 5 bytes por luz contra ~20 em texto, e o
    // navegador não paga o parse de um JSON de dezenas de milhares de números.
    const buffer = Buffer.alloc(4 + count * 2 + count * 2 + count);
    buffer.writeUInt32LE(count, 0);
    for (let i = 0; i < count; i++) {
      buffer.writeInt16LE(lons[i], 4 + i * 2);
      buffer.writeInt16LE(lats[i], 4 + count * 2 + i * 2);
      buffer.writeUInt8(intensities[i], 4 + count * 4 + i);
    }

    const outPath = path.resolve(dataDir, 'city-lights.bin');
    await fs.writeFile(outPath, buffer);

    // Remove o formato antigo para não ficar arquivo órfão sendo servido.
    try {
      await fs.unlink(path.resolve(dataDir, 'city-lights.json'));
    } catch {
      /* já não existia */
    }

    const sizeKb = (buffer.length / 1024).toFixed(0);
    console.log(`  city-lights.bin: ${count} luzes, ${sizeKb} KB`);

    console.log('[32m✔ Sucesso! Etapa 4 concluída. Luzes extraídas.[0m');
  } catch (error) {
    console.error(`[31mErro ao extrair luzes: ${error.message}[0m`);
    console.error(error.stack);
    process.exit(1);
  }
}

// --- Função Main ---
async function main() {
  const only = process.argv[2];
  console.log('Iniciando script de pré-processamento...');

  if (!only || only === 'data') await processDataFiles();
  if (!only || only === 'borders') await generateBorderLines();
  if (!only || only === 'textures') await generateEarthTextures();
  if (!only || only === 'lights') await generateCityLights();

  console.log(
    '\n\x1b[32m--- SCRIPT DE PRÉ-PROCESSAMENTO CONCLUÍDO COM SUCESSO ---\x1b[0m',
  );
}
main().catch((e) => {
  console.error('Falha crítica no script de build:', e);
  process.exit(1);
});
