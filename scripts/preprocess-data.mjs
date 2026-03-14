// scripts/preprocess-data.mjs
// ESTA É A VERSÃO ATUALIZADA COM A LÓGICA DE "TILING" (FATIAMENTO)

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';
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
      const stateDisplayName = translations[stateName] || stateName;
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
        const centroid = getGeoJsonCentroid(feature.geometry);
        lat = centroid.lat;
        lon = centroid.lon;
        geoMapping[stateKey] = { lat, lon };
        flightLocations.push({ key: stateKey, name: stateDisplayName, lat, lon });
      }

      stateLabelsTiled[countryName].push({
        name: stateDisplayName, 
        key: stateKey,         
        lat,
        lon,
      });
    }

    // --- 5. Processar countries.geojson (PARA RÓTULOS DE PAÍSES) ---
    // --- (INÍCIO DA CORREÇÃO) ---
    console.log('Processando countries.geojson...');
    for (const feature of countriesData.features) {
      const name = getNameFromProperties(feature.properties); // Ex: "Brazil" (Maiúscula)
      const continent = getContinentFromProperties(feature.properties);
      const key_lowercase = name.toLowerCase(); // Ex: "brazil" (Minúscula)
      const displayName = translations[name] || name;

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
      // 3. Se não achar, calcula o centroide (Fallback)
      else {
        const centroid = getGeoJsonCentroid(feature.geometry);
        lat = centroid.lat;
        lon = centroid.lon;
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
      });
      countryLabelNames.add(displayName);
    }
    // --- (FIM DA CORREÇÃO) ---


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

// --- ETAPA 2 (Geração de Textura com Fronteiras - Inalterada) ---
const stringToVividColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 90%, 60%)`;
};
const drawGeoJson = (ctx, features, isState) => {
  ctx.lineWidth = isState ? 1 : 2.5;
  const countryNameKeys = [
    'NAME', 'ADMIN', 'sovereignt', 'name', 'name_long', 'formal_en',
  ];
  features.forEach((feature) => {
    if (!isState) {
      let countryName = '';
      for (const key of countryNameKeys) {
        if (feature.properties && typeof feature.properties[key] === 'string') {
          countryName = feature.properties[key];
          break;
        }
      }
      ctx.strokeStyle = stringToVividColor(countryName || String(Math.random()));
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    }
    const drawPath = (coords) => {
      if (coords.length === 0) return;
      const [startX, startY] = coords[0];
      ctx.moveTo(
        (startX + 180) * (ctx.canvas.width / 360),
        (-1 * startY + 90) * (ctx.canvas.height / 180),
      );
      coords.slice(1).forEach(([lon, lat]) => {
        ctx.lineTo(
          (lon + 180) * (ctx.canvas.width / 360),
          (-1 * lat + 90) * (ctx.canvas.height / 180),
        );
      });
    };
    ctx.beginPath();
    const { type, coordinates } = feature.geometry;
    if (type === 'Polygon') (coordinates).forEach((ring) => drawPath(ring));
    else if (type === 'MultiPolygon')
      (coordinates).forEach((polygon) =>
        polygon.forEach((ring) => drawPath(ring)),
      );
    else if (type === 'LineString') drawPath(coordinates);
    else if (type === 'MultiLineString')
      (coordinates).forEach((line) => drawPath(line));
    ctx.stroke();
  });
};
async function generateTextureWithBoundaries() {
  console.log('Iniciando Etapa 2: Pré-renderização da textura com fronteiras...');
  const baseTexturePath = path.resolve(texturesDir, 'earth-1.png');
  const countriesPath = path.resolve(dataDir, 'countries.geojson');
  const statesPath = path.resolve(dataDir, 'states.geojson');
  const outputPath = path.resolve(texturesDir, 'earth-1-with-borders.png');
  try {
    const fileBuffer = await fs.readFile(baseTexturePath);
    const baseImage = await loadImage(fileBuffer);
    console.log(`Imagem base '${baseTexturePath}' carregada.`);
    const canvas = createCanvas(baseImage.width, baseImage.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(baseImage, 0, 0);
    const countriesData = JSON.parse(await fs.readFile(countriesPath, 'utf-8'));
    const statesData = JSON.parse(await fs.readFile(statesPath, 'utf-8'));
    console.log('Arquivos GeoJSON carregados.');
    console.log('Desenhando fronteiras de estados...');
    drawGeoJson(ctx, statesData.features, true);
    console.log('Desenhando fronteiras de países...');
    drawGeoJson(ctx, countriesData.features, false);
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
    console.log(
      `\x1b[32m✔ Sucesso! Etapa 2 concluída. Textura pré-renderizada salva em: '${outputPath}'\x1b[0m`,
    );
  } catch (error) {
    console.error(
      `\x1b[31mErro durante a geração da textura: ${error.message}\x1b[0m`,
    );
    console.error(error.stack);
    process.exit(1);
  }
}

// --- ETAPA 3 (Compressão WebP - Inalterada) ---
const texturePaths = [
  {
    in: path.resolve(texturesDir, 'earth-1-with-borders.png'),
    out: path.resolve(texturesDir, 'earth-1-with-borders.webp'),
  },
  {
    in: path.resolve(texturesDir, 'earth-2.png'),
    out: path.resolve(texturesDir, 'earth-2.webp'),
  },
  {
    in: path.resolve(texturesDir, 'earth-3.png'),
    out: path.resolve(texturesDir, 'earth-3.webp'),
  },
  {
    in: path.resolve(texturesDir, 'earth-4.png'),
    out: path.resolve(texturesDir, 'earth-placeholder.webp'),
  },
];
async function compressTexturesToWebP() {
  console.log('Iniciando Etapa 3: Compressão de texturas para WebP...');
  try {
    for (const { in: inPath, out: outPath } of texturePaths) {
      try {
        await fs.access(inPath);
      } catch (e) {
        console.warn(
          `\x1b[33mAviso: Arquivo de textura de entrada não encontrado, pulando: ${inPath}\x1b[0m`,
        );
        continue;
      }
      console.log(`Comprimindo ${inPath} -> ${outPath}`);
      let sharpInstance = sharp(inPath);
      if (inPath.includes('earth-4.png')) {
        console.log('...Redimensionando placeholder para 1024px de largura...');
        sharpInstance = sharpInstance.resize(1024);
      }
      await sharpInstance
        .webp({ quality: 80 })
        .toFile(outPath);
    }
    console.log(
      `\x1b[32m✔ Sucesso! Etapa 3 concluída. Texturas WebP salvas em 'public/textures'. \x1b[0m`,
    );
  } catch (error) {
    console.error(
      `\x1b[31mErro durante a compressão WebP: ${error.message}\x1b[0m`,
    );
    console.error(error.stack);
    process.exit(1);
  }
}

// --- Função Main (Inalterada) ---
async function main() {
  console.log('Iniciando script de pré-processamento...');
  await processDataFiles();
  await generateTextureWithBoundaries();
  await compressTexturesToWebP();
  console.log(
    '\n\x1b[32m--- SCRIPT DE PRÉ-PROCESSAMENTO CONCLUÍDO COM SUCESSO ---\x1b[0m',
  );
}
main().catch((e) => {
  console.error('Falha crítica no script de build:', e);
  process.exit(1);
});