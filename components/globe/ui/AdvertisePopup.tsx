// components/globe/ui/AdvertisePopup.tsx
// components/globe/ui/AdvertisePopup.tsx [CORRIGIDO]
'use client';

import React, { FC, useState, FormEvent, ReactNode, useEffect } from 'react';
import LocationTagInput from '@/components/globe/ui/LocationTagInput';
import MultiSelectButtons from '@/components/globe/ui/MultiSelectButtons';
import SingleSelectButtons from '@/components/globe/ui/SingleSelectButtons';
import ImageDropzone from '@/components/globe/ui/ImageDropzone';
import { FlightLocation } from '@/app/types/flight';
// --- INÍCIO DA MODIFICAÇÃO ---
// Importa os tipos de AdData e AdLayer do local correto
import { AdData, AdLayer } from '@/app/types/globe';
// --- FIM DA MODIFICAÇÃO ---

// --- Tipos Locais (sem AdData/AdLayer que foram movidos) ---
type AgeGroup = 'all' | '18-24' | '25-34' | '35-44' | '45-54' | '55+';
type Interest =
  | 'fashion'
  | 'luxury'
  | 'health'
  | 'relationship'
  | 'home'
  | 'gardening'
  | 'subscriptions'
  | 'b2b'
  | 'retail'
  | 'geek';
type Language = 'pt' | 'en' | 'es' | 'fr';
type Gender = 'male' | 'female';
type ProductType = 'physical' | 'subscription';


interface AdvertisePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAdSubmit: (adData: AdData) => void;
}

interface FormData {
  locations: FlightLocation[];
  ageGroups: AgeGroup[];
  interests: Interest[];
  languages: Language[];
  genders: Gender[];
  adLayer: AdLayer | null;
  productType: ProductType | null;
  adTitle: string;
  adImage: File | null;
  websiteUrl: string;
  telegramUrl: string;
}

// --- Constantes para Opções (sem alterações) ---
const AGE_OPTIONS: ReadonlyArray<{ value: AgeGroup; label: string }> = [ { value: '18-24', label: '18-24' }, { value: '25-34', label: '25-34' }, { value: '35-44', label: '35-44' }, { value: '45-54', label: '45-54' }, { value: '55+', label: '55+' }, ]; // [cite: 2410]
const ALL_AGES_OPTION: { value: AgeGroup; label: string } = { value: 'all', label: 'Todas as idades' }; // [cite: 2411]
const INTEREST_OPTIONS: ReadonlyArray<{ value: Interest; label: string }> = [ { value: 'fashion', label: 'Moda' }, { value: 'luxury', label: 'Luxo' }, { value: 'health', label: 'Saúde' }, { value: 'relationship', label: 'Relacionamento' }, { value: 'home', label: 'Casa' }, { value: 'gardening', label: 'Jardinagem' }, { value: 'subscriptions', label: 'Assinaturas' }, { value: 'b2b', label: 'B2B' }, { value: 'retail', label: 'Varejo' }, { value: 'geek', label: 'Geek' }, ]; // [cite: 2412]
const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Language; label: string }> = [ { value: 'pt', label: 'Português' }, { value: 'en', label: 'Inglês' }, { value: 'es', label: 'Espanhol' }, { value: 'fr', label: 'Francês' }, ]; // [cite: 2413]
const GENDER_OPTIONS: ReadonlyArray<{ value: Gender; label: string }> = [ { value: 'male', label: 'Masculino' }, { value: 'female', label: 'Feminino' }, ]; // [cite: 2414]
const AD_LAYER_OPTIONS: ReadonlyArray<{ value: AdLayer; label: string }> = [ { value: 'layer3', label: 'Camada 3 Céu (Zoom Distante)' }, { value: 'layer2', label: 'Camada 2 Queda (Zoom Médio)' }, { value: 'layer1', label: 'Camada 1 Terra (Zoom Próximo)' }, ]; // [cite: 2415]
const PRODUCT_TYPE_OPTIONS: ReadonlyArray<{ value: ProductType; label: string }> = [ { value: 'physical', label: 'Produto Físico' }, { value: 'subscription', label: 'Assinatura' } ]; // [cite: 2416]


// --- Tooltip Simples (sem alterações) ---
const Tooltip: FC<{ content: ReactNode; children: ReactNode }> = ({ content, children }) => ( <div className="relative inline-block group"> {children} <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 border border-gray-700"> {content} <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-900"></div> </div> </div> ); // [cite: 2418]

// --- Estado Inicial ---
const initialFormData: FormData = {
  locations: [], // [cite: 2421]
  ageGroups: ['all'], // [cite: 2422]
  interests: [], // [cite: 2423]
  languages: [], // [cite: 2424]
  genders: [], // [cite: 2425]
  adLayer: null, // [cite: 2426]
  productType: null, // [cite: 2427]
  adTitle: '', // [cite: 2428]
  adImage: null, // [cite: 2429]
  websiteUrl: '', // [cite: 2430]
  telegramUrl: '', // [cite: 2431]
}; // [cite: 2420]

const AdvertisePopup: FC<AdvertisePopupProps> = ({ isOpen, onClose, onAdSubmit }) => { // [cite: 2433]
  const [formData, setFormData] = useState<FormData>(initialFormData); // [cite: 2434]
  const [imageUrlObject, setImageUrlObject] = useState<string | null>(null); // [cite: 2436]

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => { // [cite: 2437]
    setFormData(prev => ({ ...prev, [field]: value })); // [cite: 2438]
  }; // [cite: 2439]

  const handleSubmit = (e: FormEvent) => { // [cite: 2440]
    e.preventDefault(); // [cite: 2441]

    // --- Validação ---
    if (!formData.adImage || !formData.adLayer || !formData.adTitle || !formData.websiteUrl || formData.locations.length === 0) { // [cite: 2443]
      console.error('Campos obrigatórios (Título, Imagem, Link, Camada, Localização) não preenchidos!'); // [cite: 2444]
      // Idealmente, mostrar um erro mais visível para o usuário
      return; // [cite: 2446]
    }

    // --- CORREÇÃO CRÍTICA: Usa a `key` do local, que é a chave única e confiável ---
    const mainLocationKey = formData.locations[0].key; // <--- USA A CHAVE ÚNICA!


    // Limpa a URL antiga ANTES de criar uma nova, se existir
    if (imageUrlObject) { // [cite: 2452]
      URL.revokeObjectURL(imageUrlObject); // [cite: 2453]
      console.log("Revogando URL antiga no submit:", imageUrlObject); // [cite: 2454]
      setImageUrlObject(null); // [cite: 2455]
    }

    // Cria uma URL temporária para a imagem
    const newImageUrl = URL.createObjectURL(formData.adImage); // [cite: 2458]
    setImageUrlObject(newImageUrl); // [cite: 2459] Armazena a NOVA URL para limpeza posterior

    const newAdData: AdData = {
      id: `ad-${Date.now()}-${Math.random().toString(36).substring(7)}`, // [cite: 2461] ID Único
      title: formData.adTitle, // [cite: 2462]
      imageUrl: newImageUrl, // [cite: 2463] Usa a URL criada
      layer: formData.adLayer, // [cite: 2464]
      websiteUrl: formData.websiteUrl, // [cite: 2465]
      // --- CORREÇÃO: Adiciona a chave CORRETA do local (o nome) ---
      locationKey: mainLocationKey, // [cite: 2467]
      // --- FIM DA CORREÇÃO ---
    }; // [cite: 2460]

    onAdSubmit(newAdData); // [cite: 2470] Envia os dados para o GlobeCanvas
    console.log('Dados do Anúncio Enviados:', newAdData); // [cite: 2471]
    setFormData(initialFormData); // [cite: 2472] Reseta o formulário
    // Não limpamos imageUrlObject aqui, ele será limpo no useEffect de limpeza ou no próximo submit [cite: 2473]
    onClose(); // [cite: 2474]
  }; // [cite: 2475]

  // Limpeza da Object URL quando o popup fecha (handleClose) ou desmonta
  useEffect(() => { // [cite: 2477]
    return () => { // [cite: 2480]
      if (imageUrlObject) { // [cite: 2481]
        URL.revokeObjectURL(imageUrlObject); // [cite: 2482]
        console.log('Object URL revogada na desmontagem/cleanup:', imageUrlObject); // [cite: 2483]
      }
    }; // [cite: 2486]
  }, [imageUrlObject]); // [cite: 2487]

  // Função onClose modificada para limpar a URL caso o usuário cancele
  const handleClose = () => { // [cite: 2489]
    if (imageUrlObject) { // [cite: 2490]
      URL.revokeObjectURL(imageUrlObject); // [cite: 2491]
      console.log("Object URL revogada ao cancelar:", imageUrlObject); // [cite: 2492]
      setImageUrlObject(null); // [cite: 2493]
    }
    setFormData(initialFormData); // [cite: 2495] Reseta o formulário ao cancelar também
    onClose(); // [cite: 2496]
  }; // [cite: 2497]

  if (!isOpen) return null; // [cite: 2498]

  // Validação para o botão de submit (agora verifica a localização)
  const canSubmit = !!(formData.adTitle && formData.adImage && formData.websiteUrl && formData.adLayer && formData.locations.length > 0); // [cite: 2500]

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]"> {/* [cite: 2502] */}
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10" // [cite: 2505]
        onClick={handleClose} // [cite: 2506] Usa o handleClose modificado
        aria-hidden="true" // [cite: 2507]
      />

      {/* Modal Content */}
<div className="relative z-20 w-full max-w-2xl"> 
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-yellow-500 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]"> 
          {/* Alerta de Segurança */}
          <div className="p-3 bg-red-600 text-white text-sm font-semibold rounded-t-xl text-center"> {/* [cite: 2513] */}
            ⚠️ Alerta: seu anuncio será derrubado, caso seu link leve para um site suspeito, imitando sites ou plataformas legítimas. {/* [cite: 2514] */}
            Todos os links são checados pela nossa equipe protegendo os nossos usuários. {/* [cite: 2515] */}
          </div>

          {/* Cabeçalho */}
          <div className="p-4 border-b border-yellow-600 shrink-0">
            <h2 className="text-2xl font-bold text-yellow-400">Criar Anúncio</h2>
            <p className="text-base text-gray-400 mt-1">
              Configure a segmentação e o conteúdo do seu anúncio.
            </p>
          </div>

          {/* Formulário Scrollável */}
          <form id="advertise-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">

            {/* Restrições de Conteúdo */}
            <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
              <h3 className="text-lg font-semibold text-gray-300 mb-2 flex items-center gap-2">
                Restrições de Promessas
                <Tooltip content={ <div className="space-y-2 text-left"><p className="font-bold">🚫 Promessas Financeiras Proibidas:</p><ul className="list-disc list-inside text-gray-300"><li>Lucro garantido, 100% de retorno</li><li>Fique rico em X dias</li><li>Sucesso Inevitável</li><li>Dinheiro Rápido e Fácil</li></ul><p className="font-bold mt-2">🚫 Promessas de Saúde Proibidas:</p><ul className="list-disc list-inside text-gray-300"><li>Cura definitiva para [doença]</li><li>Elimine [doença/sintoma] imediatamente</li><li>Substitui seu médico</li><li>Seguro e sem efeitos colaterais.</li></ul><p className="font-bold mt-2">🚫 Termos Absolutos Proibidos:</p><ul className="list-disc list-inside text-gray-300"><li>Nunca mais falhe, A única solução</li><li>O segredo que ninguém conta, Imbatível</li></ul></div> }>
                  <span className="text-gray-400 cursor-help">(?)</span>
                </Tooltip>
              </h3>
              <p className="text-sm text-gray-400">
                Seu site não deve conter promessas enganosas ou exageradas. Passe o mouse sobre (?) para detalhes.
              </p>
            </div>

            {/* Título do Anúncio */}
            <div>
              <label htmlFor="adTitle" className="block text-base font-medium text-gray-300 mb-2">
                Escreva o título do seu anúncio <span className="text-red-500">*</span>
              </label>
              <input type="text" id="adTitle" value={formData.adTitle} onChange={(e) => updateField('adTitle', e.target.value)} placeholder="Ex: Tênis Incríveis com 50% OFF!" required maxLength={100} className="w-full text-base px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              <p className="text-sm text-gray-400 mt-2">Máximo de 100 caracteres.</p>
            </div>

            {/* Upload de Imagem */}
            <ImageDropzone label="Imagem do Anúncio (1000x1000 PNG)" onFileChange={(file) => updateField('adImage', file)} required={true} />

            {/* Tipo de Produto */}
            <SingleSelectButtons label="Tipo de Produto/Serviço:" options={PRODUCT_TYPE_OPTIONS} selectedValue={formData.productType} onChange={(val) => updateField('productType', val)} />

            {/* Localização (Limitado a 1 tag agora) */}
            <LocationTagInput label="Em qual país, estado ou província seu anúncio deverá aparecer? *" selectedLocations={formData.locations} onChange={(locs) => updateField('locations', locs)} maxTags={1} />

            {/* Idade */}
            <MultiSelectButtons label="Idade do seu público?" options={AGE_OPTIONS} selectedValues={formData.ageGroups} onChange={(ages) => updateField('ageGroups', ages)} allowAllOption={ALL_AGES_OPTION} />

            {/* Interesses */}
            <MultiSelectButtons label="Qual interesse do seu público?" options={INTEREST_OPTIONS} selectedValues={formData.interests} onChange={(ints) => updateField('interests', ints)} />

            {/* Idiomas */}
            <MultiSelectButtons label="Qual idioma seu público fala?" options={LANGUAGE_OPTIONS} selectedValues={formData.languages} onChange={(langs) => updateField('languages', langs)} />

            {/* Sexo */}
            <MultiSelectButtons label="Qual o sexo do seu público?" options={GENDER_OPTIONS} selectedValues={formData.genders} onChange={(gends) => updateField('genders', gends)} />

            {/* Camada do Anúncio */}
            <SingleSelectButtons label="Em qual camada (nível de zoom) seu anúncio deverá aparecer? *" options={AD_LAYER_OPTIONS} selectedValue={formData.adLayer} onChange={(layer) => updateField('adLayer', layer)} />

f
            {/* Link do Site */}
            <div>
              <label htmlFor="websiteUrl" className="block text-base font-medium text-gray-300 mb-2">
                Link do seu site (URL completa, ex: https://...) <span className="text-red-500">*</span>
              </label>
              <input type="url" id="websiteUrl" value={formData.websiteUrl} onChange={(e) => updateField('websiteUrl', e.target.value)} placeholder="https://www.seusite.com" required className="w-full text-base px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
            </div>

            {/* Link do Telegram (Opcional) */}
            <div>
              <label htmlFor="telegramUrl" className="block text-base font-medium text-gray-300 mb-2">
                Link do seu Telegram (Opcional)
              </label>
              <input type="url" id="telegramUrl" value={formData.telegramUrl} onChange={(e) => updateField('telegramUrl', e.target.value)} placeholder="https://t.me/seu_canal" className="w-full text-base px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
            </div>

          </form>

          {/* Rodapé Fixo */}
          <div className="shrink-0 p-4 border-t border-gray-700 bg-gray-900 rounded-b-xl flex justify-between items-center">
            <button type="button" onClick={handleClose} className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"> Cancelar </button>
            <button type="submit" form="advertise-form" disabled={!canSubmit} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"> Enviar Anúncio </button>
          </div> {/* [cite: 2582] */}
        </div> {/* [cite: 2583] */}
      </div> {/* [cite: 2584] */}
    </div> /* [cite: 2585] */
  ); // [cite: 2586]
}; // [cite: 2587]

export default AdvertisePopup; // [cite: 2588]