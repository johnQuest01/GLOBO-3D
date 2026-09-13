/**
 * Dá uma coordenada às contas que já existem.
 *
 * POR QUE PRECISA DE UM PASSO À PARTE. A coordenada passou a ser recolhida no
 * momento da escolha do lugar (ver lib/geo/lugar.ts), mas quem já se cadastrou
 * escolheu antes disso: essas contas têm só os nomes, e continuariam sendo
 * situadas pelo palpite antigo — o mesmo que mandou uma conta com Rússia e
 * Moscou preenchidos para a Sibéria, a 4.895 km de casa.
 *
 * USA `ondeFica` DO APLICATIVO, e não uma cópia da regra. Uma segunda
 * implementação divergiria da primeira na primeira correção, e o banco ficaria
 * com pontos que o formulário nunca produziria.
 *
 * NÃO TOCA EM QUEM JÁ TEM PONTO, e é isso que o torna seguro de rodar de novo:
 * uma coordenada guardada veio de uma escolha da pessoa, e este roteiro nunca
 * sabe mais do que ela.
 */
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

import { CidadeLinha, LinhaComCoordenada, ondeFica } from "../lib/geo/lugar";

const linhaEnv = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
if (!linhaEnv) throw new Error("sem DATABASE_URL em .env.local");
const sql = neon(
  linhaEnv
    .slice(13)
    .trim()
    .replace(/^['"]|['"]$/g, ""),
);

const ler = (p: string) => JSON.parse(readFileSync(`public/data/${p}`, "utf8"));
const paises: LinhaComCoordenada[] = ler("country-labels.json");
const cidades: CidadeLinha[] = ler("city-search.json").cities;
const rotulos: { name: string; key: string }[] = ler("country-labels.json");

/** Um arquivo por país, e lido uma vez só: há 177 deles. */
const cacheEstados = new Map<string, LinhaComCoordenada[]>();
function estadosDe(pais: string | null): LinhaComCoordenada[] {
  if (!pais) return [];
  const achado = rotulos.find(
    (p) =>
      p.name.toLowerCase() === pais.trim().toLowerCase() ||
      p.key.toLowerCase() === pais.trim().toLowerCase(),
  );
  if (!achado) return [];
  const jaLido = cacheEstados.get(achado.key);
  if (jaLido) return jaLido;
  let lista: LinhaComCoordenada[] = [];
  try {
    lista = ler(`state-labels-tiled/${achado.key}.json`);
  } catch {
    lista = [];
  }
  cacheEstados.set(achado.key, lista);
  return lista;
}

interface Conta {
  id: string;
  nickname: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

async function principal() {
  const contas = (await sql`
  select id, nickname, country, state, city, lat, lon
    from users order by created_at`) as unknown as Conta[];

  let preenchidas = 0;
  let jaTinham = 0;
  let semLugar = 0;

  for (const u of contas) {
    const quem = u.nickname ?? u.id;

    if (u.lat !== null && u.lon !== null) {
      jaTinham++;
      continue;
    }

    const achado = ondeFica(u, {
      paises,
      cidades,
      estados: estadosDe(u.country),
    });

    if (!achado) {
      semLugar++;
      const escrito =
        [u.city, u.state, u.country].filter(Boolean).join(" / ") ||
        "nada preenchido";
      console.log(`  -  ${quem}: nao consegui situar (${escrito})`);
      continue;
    }

    await sql`
    update users set lat = ${achado.lat}, lon = ${achado.lon}
     where id = ${u.id}::uuid`;
    preenchidas++;
    console.log(
      `  ok ${quem}: ${achado.precisao} ${achado.rotulo} -> ${achado.lat}, ${achado.lon}`,
    );
  }

  console.log(
    `\npreenchidas: ${preenchidas} | ja tinham: ${jaTinham} | sem lugar: ${semLugar}`,
  );
}

// Envolvido numa funcao porque o roteiro roda em CommonJS, onde `await` solto
// no topo do arquivo nao existe.
void principal();
