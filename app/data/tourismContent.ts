// app/data/tourismContent.ts
/**
* Define a estrutura de um item de mídia para o popup de turismo.
*/
export interface TourismMedia {
id: string; // Identificador único para a mídia
type: 'image' | 'video'; // Tipo de mídia
title: string; // Título exibido no carrossel
locationKey: string; // Chave do local (ex: "são paulo", "france")
// DEVE CORRESPONDER a uma chave em 'geo-mapping.json' (que é baseada no inglês)
thumbnailUrl: string; // URL para a miniatura no carrossel
fullUrl: string; // URL para a imagem em alta resolução ou para o vídeo
videoUrl?: string; // Opcional: Se 'type' for 'image', pode ter um vídeo associado
}

/**
* Lista de todo o conteúdo de mídia turística.
*/
export const tourismContent: TourismMedia[] = [
{
id: 'sp-img-1',
type: 'image',
title: 'Ponte Estaiada',
locationKey: 'são paulo', // Esta chave funciona pois é idêntica no geo-mapping.json
thumbnailUrl: '/tourism/sp-thumb-1.jpg',
fullUrl: '/tourism/sp-full-1.jpg',
videoUrl: '/tourism/sp-video-1.mp4',
},
{
id: 'sp-vid-1',
type: 'video',
title: 'Sobrevoo São Paulo',
locationKey: 'são paulo', // Esta chave funciona
thumbnailUrl: '/tourism/sp-thumb-2.jpg',
fullUrl: '/tourism/sp-video-1.mp4',
},
{
id: 'fr-img-1',
type: 'image',
title: 'Torre Eiffel',
// --- CORREÇÃO APLICADA ---
// A chave DEVE ser o nome em inglês (do geojson) em minúsculas.
locationKey: 'france', // Alterado de 'frança'
// --- FIM DA CORREÇÃO ---
thumbnailUrl: '/tourism/fr-thumb-1.jpg',
fullUrl: '/tourism/fr-full-1.jpg',
videoUrl: '/tourism/fr-video-1.mp4',
},
{
id: 'ru-vid-1',
type: 'video',
title: 'Catedral de São Basílio',
// --- CORREÇÃO APLICADA ---
// A chave DEVE ser o nome em inglês (do geojson) em minúsculas.
locationKey: 'Russia', // Alterado de 'rússia'
// --- FIM DA CORREÇÃO ---
thumbnailUrl: '/tourism/ru-thumb-1.jpg', // Você precisará adicionar este thumbnail
fullUrl: '/tourism/ru-video-1.mp4', // Você precisará adicionar este vídeo
},
];