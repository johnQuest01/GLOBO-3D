// app/types/flight.ts

/**
 * Representa um local disponível para seleção no popup de viagem.
 * Contém os dados mínimos necessários para calcular a rota.
 */
export interface FlightLocation {
  key: string;
  name: string;
  lat: number;
  lon: number;
}