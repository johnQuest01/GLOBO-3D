// components/globe/config/airlines.ts
// Configuração de companhias aéreas para os aviões de marketing do globo.
// Frontend puro — para adicionar uma companhia, basta incluir um objeto aqui.

export interface Airline {
  key: string;
  name: string; // Nome exibido na etiqueta do avião
  color: string; // Cor da fuselagem/emissão do avião e do rastro
  labelBg: string; // Cor de fundo da etiqueta
  labelText: string; // Cor do texto da etiqueta
}

export const AIRLINES: Record<string, Airline> = {
  latam: {
    key: 'latam',
    name: 'LATAM',
    color: '#2C0D82',
    labelBg: '#1B0088',
    labelText: '#FFFFFF',
  },
  gol: {
    key: 'gol',
    name: 'GOL',
    color: '#FF6600',
    labelBg: '#FF6600',
    labelText: '#FFFFFF',
  },
  azul: {
    key: 'azul',
    name: 'AZUL',
    color: '#0072CE',
    labelBg: '#0072CE',
    labelText: '#FFFFFF',
  },
  emirates: {
    key: 'emirates',
    name: 'Emirates',
    color: '#D71921',
    labelBg: '#D71921',
    labelText: '#FFFFFF',
  },
  qatar: {
    key: 'qatar',
    name: 'Qatar Airways',
    color: '#5C0632',
    labelBg: '#5C0632',
    labelText: '#FFFFFF',
  },
  lufthansa: {
    key: 'lufthansa',
    name: 'Lufthansa',
    color: '#0C2340',
    labelBg: '#0C2340',
    labelText: '#FFD200',
  },
  american: {
    key: 'american',
    name: 'American',
    color: '#0078D2',
    labelBg: '#0078D2',
    labelText: '#FFFFFF',
  },
  airfrance: {
    key: 'airfrance',
    name: 'Air France',
    color: '#002157',
    labelBg: '#002157',
    labelText: '#EF3340',
  },
};

// Companhia padrão (fallback) para voos iniciados pelo usuário.
export const DEFAULT_AIRLINE: Airline = AIRLINES.gol;

export function getAirline(key?: string | null): Airline {
  if (key && AIRLINES[key]) return AIRLINES[key];
  return DEFAULT_AIRLINE;
}
