// components/globe/ui/ImageDropzone.tsx
'use client';

import React, { FC, useState, useCallback, DragEvent, ChangeEvent } from 'react';

// Ícone de Upload (simples SVG)
const UploadIcon: FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
    />
  </svg>
);

interface ImageDropzoneProps {
  label: string;
  onFileChange: (file: File | null) => void;
  required?: boolean;
}

const ImageDropzone: FC<ImageDropzoneProps> = ({ label, onFileChange, required }) => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File | null) => {
    setError(null); // Limpa erros anteriores
    if (file) {
      // Validação básica de tipo
      if (file.type !== 'image/png') {
        setError('Formato inválido. Apenas PNG é permitido.');
        onFileChange(null);
        setImagePreviewUrl(null);
        return;
      }
      // Validação de tamanho (exemplo: max 5MB)
      if (file.size > 5 * 1024 * 1024) {
          setError('Imagem muito grande. Máximo de 5MB permitido.');
          onFileChange(null);
          setImagePreviewUrl(null);
          return;
      }

      // Validação de dimensões (requer carregar a imagem)
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          if (img.width !== 1000 || img.height !== 1000) {
              setError('Dimensões inválidas. A imagem deve ser 1000x1000 pixels.');
              onFileChange(null);
              setImagePreviewUrl(null);
          } else {
              // Tudo OK
              setImagePreviewUrl(reader.result as string);
              onFileChange(file);
          }
        };
        img.onerror = () => {
            setError('Não foi possível ler as dimensões da imagem.');
            onFileChange(null);
            setImagePreviewUrl(null);
        }
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
          setError('Erro ao ler o arquivo.');
          onFileChange(null);
          setImagePreviewUrl(null);
      }
      reader.readAsDataURL(file);

    } else {
      setImagePreviewUrl(null);
      onFileChange(null);
    }
  }, [onFileChange]);

  const handleDragOver = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
        e.dataTransfer.clearData();
      }
    },
    [handleFile]
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      } else {
        handleFile(null); // Limpa se o usuário cancelar
      }
      // Reseta o input para permitir selecionar o mesmo arquivo novamente
      e.target.value = '';
    },
    [handleFile]
  );

  const triggerFileInput = () => {
    document.getElementById('adImageInput')?.click();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <label
        htmlFor="adImageInput"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex flex-col items-center justify-center w-full h-48 sm:h-64
          border-2 border-dashed rounded-lg cursor-pointer
          transition-colors duration-200 ease-in-out
          ${isDragging ? 'border-cyan-400 bg-gray-700/50' : 'border-gray-600 bg-gray-700/30 hover:bg-gray-700/40'}
          ${error ? 'border-red-500' : ''}
          relative overflow-hidden group
        `}
      >
        {imagePreviewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreviewUrl}
              alt="Pré-visualização do anúncio"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Overlay para botão de remover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault(); // Impede que o label seja clicado
                  e.stopPropagation();
                  handleFile(null);
                }}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors z-10"
              >
                Remover Imagem
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
            <UploadIcon className={`w-10 h-10 mb-3 ${isDragging ? 'text-cyan-400' : 'text-gray-400'}`} />
            <p className={`mb-2 text-sm ${isDragging ? 'text-cyan-300' : 'text-gray-400'}`}>
              <span className="font-semibold">Clique para enviar</span> ou arraste e solte
            </p>
            <p className="text-xs text-gray-500">PNG (1000x1000px, máx 5MB)</p>
          </div>
        )}
        <input
          id="adImageInput"
          type="file"
          className="hidden"
          accept="image/png"
          onChange={handleFileSelect}
          required={required && !imagePreviewUrl} // Só é required se não houver imagem
        />
      </label>
      {error && (
          <p className="text-red-400 text-xs mt-1">{error}</p>
      )}
       {/* Botão alternativo para acessibilidade e mobile */}
       {!imagePreviewUrl && (
            <button
                type="button"
                onClick={triggerFileInput}
                className="mt-2 w-full sm:w-auto px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
                Selecionar Arquivo
            </button>
       )}
    </div>
  );
};

export default ImageDropzone;
