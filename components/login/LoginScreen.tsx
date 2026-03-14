// components/login/LoginScreen.tsx
'use client';

import React, { useState, FormEvent, ChangeEvent } from 'react';
import Image from 'next/image';
import LoginBackground from './LoginBackground'; // Importa o fundo 3D
import { useRouter } from 'next/navigation';
import { UserProfileData } from '@/app/types/user';

interface FormData {
  fullName: string;
  age: string;
  city: string;
  email: string;
  isLogin: boolean;
}

// --- INÍCIO DA CORREÇÃO DE TIPO ---

// 1. Criamos um tipo que representa APENAS as chaves de FormData
//    que correspondem a valores 'string'.
//    Isso exclui 'isLogin' (que é boolean).
type ValidatableFieldKeys = {
  [K in keyof FormData]: FormData[K] extends string ? K : never;
}[keyof FormData];
// O resultado de ValidatableFieldKeys é: "fullName" | "age" | "city" | "email"

// --- FIM DA CORREÇÃO DE TIPO ---

// Icones (simplesmente SVGs, você pode mover para app/icons se preferir)
const IconUser = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
    />
  </svg>
);

const IconMail = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.907l-7.195 3.583a2.25 2.25 0 01-2.36 0L3.32 8.907A2.25 2.25 0 012.25 6.993V6.75"
    />
  </svg>
);

const IconCake = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 8.25V12m0 0l3-3m-3 3l-3-3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const IconHome = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-6 h-6 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  </svg>
);

const LoginScreen: React.FC = () => {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    age: '',
    city: '',
    email: '',
    isLogin: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // A função de validação está correta, não precisa mudar.
  const validateField = (name: string, value: string): string => {
    let error = '';
    const nameRegex = /^[A-Za-z\s\u00C0-\u017F]+$/;

    switch (name) {
      case 'fullName':
        if (!value.trim()) error = 'Nome completo é obrigatório.';
        else if (!nameRegex.test(value))
          error = 'Apenas letras e espaços são permitidos.';
        else if (value.length > 170) error = 'Máximo de 170 caracteres.';
        break;
      case 'age':
        if (!value.trim()) error = 'Idade é obrigatória.';
        else if (!/^\d+$/.test(value)) error = 'Apenas números são permitidos.';
        else if (value.length > 2) error = 'Máximo de 2 dígitos.';
        else if (parseInt(value) < 1 || parseInt(value) > 120)
          error = 'Idade inválida (1-120).';
        break;
      case 'city':
        if (!value.trim()) error = 'Cidade é obrigatória.';
        else if (!nameRegex.test(value))
          error = 'Apenas letras, espaços e acentos são permitidos.';
        else if (value.length > 170) error = 'Máximo de 170 caracteres.';
        break;
      case 'email':
        if (!value.trim()) error = 'Email é obrigatório.';
        const emailPrefix = value.split('@')[0];
        if (!/^[a-zA-Z0-9.]+$/.test(emailPrefix))
          error = 'Caracteres inválidos antes do @gmail.com.';
        else if (emailPrefix.length > 30)
          error = 'Máximo de 30 caracteres antes do @gmail.com.';
        else if (!value.endsWith('@gmail.com'))
          error = 'Email deve terminar com @gmail.com';
        break;
      default:
        break;
    }
    return error;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'email') {
      let emailPrefix = value.split('@')[0];
      emailPrefix = emailPrefix.replace(/[^a-zA-Z0-9.]/g, '');
      if (emailPrefix.length > 30) {
        emailPrefix = emailPrefix.substring(0, 30);
      }
      if (value.includes('@gmail.com')) {
        newValue = emailPrefix + '@gmail.com';
      } else {
        newValue = emailPrefix;
      }
      if (value.length > 0 && !value.includes('@')) {
        newValue = emailPrefix;
      }
    }

    if (name === 'age') {
      newValue = newValue.replace(/[^0-9]/g, '');
      if (newValue.length > 2) {
        newValue = newValue.substring(0, 2);
      }
    }

    if (name === 'fullName' || name === 'city') {
      newValue = newValue.replace(/[^A-Za-z\s\u00C0-\u017F]/g, '');
      if (newValue.length > 170) {
        newValue = newValue.substring(0, 170);
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));

    if (name === 'email' && e.target === document.activeElement) {
      const prefixError = validateField(name, newValue.split('@')[0]);
      setErrors((prev) => ({ ...prev, [name]: prefixError }));
    } else {
      const error = validateField(name, newValue);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const handleEmailBlur = (e: ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.length > 0 && !value.endsWith('@gmail.com')) {
      value = value.split('@')[0] + '@gmail.com';
      value = value.replace(/[^a-zA-Z0-9.@]/g, '');
    }
    setFormData((prev) => ({ ...prev, email: value }));
    const error = validateField('email', value);
    setErrors((prev) => ({ ...prev, email: error }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const newErrors: { [key: string]: string } = {};

    // --- 2. USAMOS O NOVO TIPO AQUI ---
    // Agora 'fieldsToValidate' SÓ pode conter chaves de campos string.
    let fieldsToValidate: Array<ValidatableFieldKeys> = ['email'];

    if (!formData.isLogin) {
      fieldsToValidate = ['fullName', 'age', 'city', 'email'];
    }

    // --- 3. O ERRO DESAPARECE ---
    // O TypeScript agora sabe que 'key' SÓ pode ser "fullName", "age", "city", ou "email".
    // Portanto, ele sabe que 'formData[key]' SEMPRE será uma string.
    fieldsToValidate.forEach((key) => {
      const error = validateField(key, formData[key]);
      if (error) {
        newErrors[key] = error;
      }
    });

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      let userData: UserProfileData;

      if (formData.isLogin) {
        console.log('Tentando logar:', { email: formData.email });
        userData = {
          email: formData.email,
          fullName: formData.email.split('@')[0],
          age: '99',
          city: 'Internet',
        };
      } else {
        console.log('Tentando cadastrar:', formData);
        userData = {
          fullName: formData.fullName,
          age: formData.age,
          city: formData.city,
          email: formData.email,
        };
      }

      try {
        localStorage.setItem('userData', JSON.stringify(userData));
        router.push('/');
      } catch (storageError) {
        console.error('Falha ao salvar dados no localStorage:', storageError);
        setErrors({
          general: 'Não foi possível salvar sua sessão. Tente novamente.',
        });
      }
    } else {
      console.log('Erros de validação:', newErrors);
    }
  };

  return (
    <div className="relative w-full h-screen flex items-center justify-center p-4 overflow-hidden">
      <LoginBackground />
      <div className="absolute inset-0 bg-black/60 z-10" />
      <div
        className="relative z-20 w-full max-w-md bg-stone-900/90 backdrop-blur-sm
rounded-xl shadow-2xl border border-green-700 p-6 sm:p-8
flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500"
      >
        <h2 className="text-3xl font-extrabold text-white text-center">
          {formData.isLogin ? 'Entrar na Conta' : 'Criar Nova Conta'}
        </h2>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => setFormData((prev) => ({ ...prev, isLogin: false }))}
            className={`px-5 py-2.5 text-base rounded-lg font-semibold transition-all duration-200
${
  !formData.isLogin
    ? 'bg-green-600 text-white shadow-md'
    : 'bg-stone-700 text-gray-300 hover:bg-stone-600'
}`}
          >
            Criar Cadastro
          </button>
          <button
            onClick={() => setFormData((prev) => ({ ...prev, isLogin: true }))}
            className={`px-5 py-2.5 text-base rounded-lg font-semibold transition-all duration-200
${
  formData.isLogin
    ? 'bg-green-600 text-white shadow-md'
    : 'bg-stone-700 text-gray-300 hover:bg-stone-600'
}`}
          >
            Entrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!formData.isLogin && (
            <>
              <div>
                <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
                  <IconUser />
                  <input
                    type="text"
                    name="fullName"
                    placeholder="Nome Completo"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="flex-1 bg-transparent text-white placeholder-gray-400 py-2 px-3 focus:outline-none text-base sm:text-lg"
                    maxLength={170}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-red-400 text-sm mt-1">
                    {errors.fullName}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
                  <IconCake />
                  <input
                    type="text"
                    name="age"
                    placeholder="Idade (ex: 30)"
                    value={formData.age}
                    onChange={handleChange}
                    className="flex-1 bg-transparent text-white placeholder-gray-400 py-2 px-3 focus:outline-none text-base sm:text-lg"
                    inputMode="numeric"
                    pattern="\d{1,2}"
                    maxLength={2}
                  />
                </div>
                {errors.age && (
                  <p className="text-red-400 text-sm mt-1">{errors.age}</p>
                )}
              </div>

              <div>
                <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
                  <IconHome />
                  <input
                    type="text"
                    name="city"
                    placeholder="Cidade onde mora"
                    value={formData.city}
                    onChange={handleChange}
                    className="flex-1 bg-transparent text-white placeholder-gray-400 py-2 px-3 focus:outline-none text-base sm:text-lg"
                    maxLength={170}
                  />
                </div>
                {errors.city && (
                  <p className="text-red-400 text-sm mt-1">{errors.city}</p>
                )}
              </div>
            </>
          )}

          <div>
            <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
              <IconMail />
              <input
                type="text"
                name="email"
                placeholder="Seu email"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleEmailBlur}
                className="flex-1 bg-transparent text-white placeholder-gray-400 py-2 px-3 focus:outline-none text-base sm:text-lg"
                maxLength={30 + '@gmail.com'.length}
              />
            </div>
            {errors.email && (
              <p className="text-red-400 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          {errors.general && (
            <p className="text-red-400 text-sm text-center">
              {errors.general}
            </p>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700
text-white text-lg font-semibold shadow-lg transition-colors
focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-stone-900 focus:ring-green-500"
          >
            {formData.isLogin ? 'Entrar' : 'Cadastrar e Entrar'}
          </button>
        </form>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-gray-700" />
          <span className="flex-shrink mx-4 text-gray-400 text-base">OU</span>
          <div className="flex-grow border-t border-gray-700" />
        </div>

        <button
          className="w-full py-3 rounded-lg bg-red-700 text-white text-lg font-semibold
shadow-lg opacity-50 cursor-not-allowed flex items-center justify-center gap-3"
          disabled
          title="Funcionalidade disponível apenas na web"
        >
          <Image
            src="/images/google-icon.png"
            alt="Google"
            width={24}
            height={24}
            className="w-6 h-6"
          />
          Entrar com Google
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;
