// components/globe/ui/DynamicVideoPlayer.tsx
// ATUALIZADO - Padding horizontal reduzido no modo horizontal
'use client';

import React, { FC } from 'react';
import { VideoContent } from '@/app/types/globe';

type VideoFormat = 'horizontal' | 'vertical';

interface DynamicVideoPlayerProps {
    video: VideoContent | null; // Permite video nulo para segurança
    currentFormat: VideoFormat;
}

// Mensagem de vídeo não disponível (sem alteração)
const NoVideoAvailable: FC = () => ( <div className="flex items-center justify-center p-8 text-center text-gray-500 h-full"><p className="text-lg">📽️ Conteúdo indisponível.</p></div> );


const DynamicVideoPlayer: FC<DynamicVideoPlayerProps> = ({ video, currentFormat }) => {

    if (!video) {
        return <NoVideoAvailable />;
    }

    const basePlayerClasses = "w-full rounded-lg overflow-hidden mx-auto shadow-xl transition-all duration-300";
    const isHorizontal = currentFormat === 'horizontal';
    const formatClasses = isHorizontal
        ? "aspect-video" // 16:9
        : "aspect-[9/16] max-w-xs sm:max-w-sm max-h-[45vh]"; // Vertical

    // 3. Container Externo (centralizador)
    // CORREÇÃO: Reduzido padding HORIZONTAL (px-*) quando isHorizontal para alargar o vídeo
    const containerClasses = `
        flex items-center justify-center h-full
        ${isHorizontal ? 'px-1 sm:px-2' : 'px-6'} // Padding horizontal menor para horizontal
        ${isHorizontal ? 'py-0' : 'pt-4 pb-6'}    // Padding vertical zero para horizontal
    `;

    const videoElementClasses = "w-full h-full object-contain block";


    // Renderiza YouTube
    if (video.type === 'youtube') {
        return (
            <div className={containerClasses}>
                <div className={`${basePlayerClasses} ${formatClasses}`}>
                    <iframe
                        width="100%" height="100%"
                        src={`https://www.youtube-nocookie.com/embed/${video.src}`}
                        title="YouTube video player" frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen className={videoElementClasses}
                    ></iframe>
                </div>
            </div>
        );
    }

    // Renderiza Vídeo Local/MP4
    if (video.type === 'video') {
        return (
            <div className={containerClasses}>
                <div className={`${basePlayerClasses} ${formatClasses} bg-black`}>
                    <video
                        key={video.src} src={video.src}
                        controls autoPlay muted loop playsInline
                        className={videoElementClasses}
                    > Seu navegador não suporta a tag de vídeo. </video>
                </div>
            </div>
        );
    }

    // Fallback
    return <NoVideoAvailable />;
};

export default DynamicVideoPlayer;