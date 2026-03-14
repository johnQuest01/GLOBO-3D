// app/types/geo.ts

/**
 * Tipagem básica para uma Feature GeoJSON.
 */
export interface GeoFeature {
  type: 'Feature';
  properties: { [key: string]: unknown };
  geometry: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
    coordinates: unknown;
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}