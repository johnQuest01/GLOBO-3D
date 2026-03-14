// components/globe/ui/statePopup/VideoTabContent.tsx
// ATUALIZADO com botão e tipo 'nature'
import React, { FC } from 'react';
import DynamicVideoPlayer from '../DynamicVideoPlayer'; // Ajuste o caminho
import { VideoContent } from '@/app/types/globe';

type VideoFormat = 'horizontal' | 'vertical';
// ATUALIZADO: Inclui 'nature'
type VideoCategoryType = 'general' | 'tourist' | 'nature';

interface VideoTabContentProps {
    // ATUALIZADO: Tipo da prop videoType
    videoType: VideoCategoryType;
    setVideoType: (type: VideoCategoryType) => void;
    currentVideoIndex: number;
    setCurrentVideoIndex: (index: number) => void;
    currentVideoFormat: VideoFormat;
    setCurrentVideoFormat: (format: VideoFormat) => void;
    videos: VideoContent[] | null;
    videoToRender: VideoContent | null;
    hasMultipleVideos: boolean;
}

const NoVideoAvailable: FC = () => ( <div className="flex items-center justify-center p-8 text-center text-gray-500 h-full"><p className="text-lg">📽️ Conteúdo indisponível.</p></div> );

const VideoTabContent: FC<VideoTabContentProps> = ({
    videoType, setVideoType,
    currentVideoIndex, setCurrentVideoIndex,
    currentVideoFormat, setCurrentVideoFormat,
    videos, videoToRender, hasMultipleVideos
}) => {

    const handlePreviousVideo = () => { setCurrentVideoIndex(Math.max(0, currentVideoIndex - 1)); };
    const handleNextVideo = () => { const maxIndex = videos ? videos.length - 1 : 0; setCurrentVideoIndex(Math.min(maxIndex, currentVideoIndex + 1)); };

    // Função auxiliar para classes dos botões de categoria
    const getButtonClass = (buttonType: VideoCategoryType) => {
        const base = 'p-2 text-xs font-semibold rounded-lg transition-colors duration-200 w-1/3'; // w-1/3 para 3 botões
        if (videoType === buttonType) {
            return `${base} bg-cyan-600 text-white border-2 border-cyan-500`;
        }
        return `${base} bg-gray-700 text-gray-300 hover:bg-gray-600`;
    };

    return (
        <div className="p-4 sm:p-6">
            {/* Botões Geral/Turístico/Natureza */}
            {/* ATUALIZADO: Agora são 3 botões */}
            <div className="flex justify-center gap-2 mb-4">
                <button onClick={() => { setVideoType('general'); setCurrentVideoIndex(0); }} className={getButtonClass('general')}>
                    Vídeo Geral
                </button>
                <button onClick={() => { setVideoType('tourist'); setCurrentVideoIndex(0); }} className={getButtonClass('tourist')}>
                    Turístico
                </button>
                <button onClick={() => { setVideoType('nature'); setCurrentVideoIndex(0); }} className={getButtonClass('nature')}>
                    Natureza
                </button>
            </div>

            {videoToRender ? (
                <>
                    {/* Paginação */}
                    {hasMultipleVideos && videos && videos.length > 0 && (
                       <div className="flex justify-between items-center gap-2 mb-2">
                           <button onClick={handlePreviousVideo} disabled={currentVideoIndex === 0} className={`p-2 text-xs font-semibold rounded-lg transition-colors duration-200 ${currentVideoIndex === 0 ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 text-white hover:bg-cyan-700'}`}>&lt; Anterior</button>
                           <div className="text-xs font-medium text-gray-400">{currentVideoIndex + 1} / {videos.length}</div>
                           <button onClick={handleNextVideo} disabled={!videos || currentVideoIndex >= videos.length - 1} className={`p-2 text-xs font-semibold rounded-lg transition-colors duration-200 ${!videos || currentVideoIndex >= videos.length - 1 ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 text-white hover:bg-cyan-700'}`}>Próximo &gt;</button>
                       </div>
                    )}
                    {/* Botões Formato */}
                    <div className="flex justify-center gap-4 mb-4">
                        <button onClick={() => setCurrentVideoFormat('horizontal')} className={`p-2 text-xs font-semibold rounded-lg transition-colors duration-200 w-1/2 ${currentVideoFormat === 'horizontal' ? 'bg-cyan-600 text-white border-2 border-cyan-500' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Horizontal</button>
                        <button onClick={() => setCurrentVideoFormat('vertical')} className={`p-2 text-xs font-semibold rounded-lg transition-colors duration-200 w-1/2 ${currentVideoFormat === 'vertical' ? 'bg-cyan-600 text-white border-2 border-cyan-500' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Vertical</button>
                    </div>
                    {/* Player */}
                    <DynamicVideoPlayer video={videoToRender} currentFormat={currentVideoFormat} />
                </>
            ) : ( <NoVideoAvailable /> )}
        </div>
    );
};

export default VideoTabContent;
