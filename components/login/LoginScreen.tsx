// components/login/LoginScreen.tsx
'use client';

import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import LoginBackground from './LoginBackground'; // Importa o fundo 3D
import { useRouter } from 'next/navigation';
import { UserProfileData } from '@/app/types/user';
import { NICKNAME_MAX, validateNickname } from '@/lib/auth/nickname';
import LocationFields from './LocationFields';

interface FormData {
  fullName: string;
  /** O nome público. É por ele que a lupa do globo encontra a pessoa. */
  nickname: string;
  age: string;
  city: string;
  state: string;
  country: string;
  email: string;
  password: string;
  confirmPassword: string;
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
    className="w-5 h-5 shrink-0 text-gray-400"
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
    className="w-5 h-5 shrink-0 text-gray-400"
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
    className="w-5 h-5 shrink-0 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 8.25V12m0 0l3-3m-3 3l-3-3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);


const IconLock = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-5 h-5 shrink-0 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

/** O arroba do nickname. Mesma família visual dos outros ícones desta tela. */
const IconAt = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-5 h-5 shrink-0 text-gray-400"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 10-2.636 6.364"
    />
  </svg>
);

const LoginScreen: React.FC = () => {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    nickname: '',
    age: '',
    city: '',
    state: '',
    country: '',
    email: '',
    password: '',
    confirmPassword: '',
    isLogin: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  /** Trava o botão enquanto o servidor responde, para não criar conta duplicada no duplo clique. */
  const [enviando, setEnviando] = useState(false);

  /*
   * O QUE DEU ERRADO NA VOLTA DO GOOGLE.
   *
   * O caminho do OAuth é um redirecionamento, não um fetch: não há resposta
   * para ler. O motivo volta na URL, e sem esta tradução a pessoa reapareceria
   * no login sem nenhuma explicação de por que não entrou.
   *
   * O parâmetro é apagado depois de lido, para o aviso não voltar se a pessoa
   * recarregar a página.
   */
  useEffect(() => {
    const motivo = new URLSearchParams(window.location.search).get('google');
    if (!motivo) return;

    const recado: Record<string, string> = {
      indisponivel: 'A entrada com Google não está configurada neste servidor.',
      cancelado: 'Você cancelou a entrada com o Google.',
      expirado: 'A tentativa demorou demais. Toque em "Entrar com Google" de novo.',
      banida: 'Esta conta está suspensa.',
      falhou: 'Não deu para entrar com o Google agora. Tente de novo.',
    };
    setErrors({ general: recado[motivo] ?? recado.falhou! });

    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // A função de validação está correta, não precisa mudar.
  const validateField = (name: string, value: string): string => {
    let error = '';
    // Hifen, apostrofo e ponto entram porque nome de lugar tem: N'Djamena,
    // Saint-Louis, Sant'Ana. A regra antiga os apagava, e a pessoa escolhia da
    // lista um nome que o campo entao corrompia.
    const nameRegex = /^[A-Za-z\s\u00C0-\u017F'\u2019.-]+$/;

    switch (name) {
      case 'fullName':
        if (!value.trim()) error = 'Nome completo é obrigatório.';
        else if (!nameRegex.test(value))
          error = 'Apenas letras e espaços são permitidos.';
        else if (value.length > 170) error = 'Máximo de 170 caracteres.';
        break;
      case 'nickname':
        // As MESMAS regras do servidor, importadas — e não recopiadas aqui.
        // Duas cópias viram duas regras diferentes na primeira alteração.
        error = validateNickname(value) ?? '';
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
      case 'state':
        if (!value.trim()) error = 'Estado é obrigatório.';
        else if (!nameRegex.test(value))
          error = 'Apenas letras, espaços e acentos são permitidos.';
        else if (value.length > 120) error = 'Máximo de 120 caracteres.';
        break;
      case 'country':
        if (!value.trim()) error = 'País é obrigatório.';
        else if (!nameRegex.test(value))
          error = 'Apenas letras, espaços e acentos são permitidos.';
        else if (value.length > 120) error = 'Máximo de 120 caracteres.';
        break;
      case 'password':
        // O mesmo mínimo que o servidor exige (lib/auth/password.ts). Validar
        // aqui é conveniência; quem decide é o servidor.
        if (!value) error = 'Senha é obrigatória.';
        else if (value.length < 8) error = 'A senha precisa de pelo menos 8 caracteres.';
        else if (value.length > 200) error = 'Máximo de 200 caracteres.';
        break;
      case 'confirmPassword':
        if (!value) error = 'Repita a senha.';
        break;
      case 'email':
        if (!value.trim()) error = 'Email é obrigatório.';
        else if (!/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value))
          error = 'Digite um email válido (ex: nome@gmail.com).';
        else if (value.length > 254) error = 'Email muito longo.';
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
      newValue = value.replace(/[^a-zA-Z0-9.@_+-]/g, '').toLowerCase();
      const atIndex = newValue.indexOf('@');
      if (atIndex !== -1) {
        const local = newValue.slice(0, atIndex);
        const domain = newValue.slice(atIndex + 1).replace(/@/g, '');
        newValue = `${local}@${domain}`;
      }
      if (newValue.length > 254) {
        newValue = newValue.substring(0, 254);
      }
    }

    if (name === 'nickname') {
      // A limpeza espelha o formato aceito (minúsculas, sem acento, sem
      // espaço). Assim a pessoa vê o nickname real enquanto digita, em vez de
      // digitar "Bruno Silva" e descobrir só ao enviar que virou outra coisa.
      newValue = newValue
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, NICKNAME_MAX);
    }

    if (name === 'age') {
      newValue = newValue.replace(/[^0-9]/g, '');
      if (newValue.length > 2) {
        newValue = newValue.substring(0, 2);
      }
    }

    if (
      name === 'fullName' ||
      name === 'city' ||
      name === 'state' ||
      name === 'country'
    ) {
      newValue = newValue.replace(/[^A-Za-z\s\u00C0-\u017F'\u2019.-]/g, '');
      if (newValue.length > 170) {
        newValue = newValue.substring(0, 170);
      }
    }

    // Senha N\u00C3O passa por limpeza nenhuma. Tirar caractere de senha \u00E9 trocar a
    // senha da pessoa sem avisar: ela digita uma coisa, o campo guarda outra, e
    // o login falha depois sem explica\u00E7\u00E3o.

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));

    const error = validateField(name, newValue);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  /**
   * Cadastro e entrada, agora contra o servidor.
   *
   * O QUE MUDOU: antes esta função aceitava qualquer e-mail, inventava
   * `age: '99'` e `city: 'Internet'`, gravava no localStorage e entrava. Não
   * havia senha, servidor nem sessão — qualquer pessoa "logava" como qualquer
   * outra digitando o e-mail dela.
   *
   * Agora quem decide é `/api/auth/register` e `/api/auth/login`, que abrem uma
   * sessão em cookie assinado. O `userData` no localStorage continua sendo
   * gravado porque o resto do app o usa para saber quem está na tela — mas ele
   * deixou de ser a prova de que a pessoa entrou. A prova é o cookie, e ele o
   * navegador não consegue forjar.
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;

    const newErrors: { [key: string]: string } = {};

    let fieldsToValidate: Array<ValidatableFieldKeys> = ['email', 'password'];
    if (!formData.isLogin) {
      fieldsToValidate = [
        'fullName',
        'nickname',
        'age',
        'city',
        'state',
        'country',
        'email',
        'password',
        'confirmPassword',
      ];
    }

    fieldsToValidate.forEach((key) => {
      const error = validateField(key, formData[key]);
      if (error) newErrors[key] = error;
    });

    if (
      !formData.isLogin &&
      !newErrors.confirmPassword &&
      formData.password !== formData.confirmPassword
    ) {
      newErrors.confirmPassword = 'As senhas não coincidem.';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setEnviando(true);
    try {
      const rota = formData.isLogin ? '/api/auth/login' : '/api/auth/register';
      // Leva junto o identificador anônimo que já existia neste navegador: é
      // o que faz o histórico de navegação da pessoa passar a ter dono, em vez
      // de começar do zero por ela ter criado conta.
      const clientId = localStorage.getItem('globoClientId');

      const corpo = formData.isLogin
        ? { email: formData.email, password: formData.password }
        : {
            email: formData.email,
            password: formData.password,
            confirmPassword: formData.confirmPassword,
            fullName: formData.fullName,
            nickname: formData.nickname,
            city: formData.city,
            state: formData.state,
            country: formData.country,
            clientId,
          };

      const resposta = await fetch(rota, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        if (dados?.errors && typeof dados.errors === 'object') {
          setErrors(dados.errors as { [key: string]: string });
        } else if (resposta.status === 401) {
          // Uma mensagem só para e-mail inexistente e senha errada — é o que o
          // servidor responde, e repetir a distinção aqui a desfaria.
          setErrors({ general: 'E-mail ou senha incorretos.' });
        } else if (resposta.status === 403) {
          setErrors({ general: dados?.message ?? 'Esta conta está suspensa.' });
        } else if (resposta.status === 503) {
          setErrors({
            general:
              'O cadastro está indisponível agora (servidor sem configuração). Tente mais tarde.',
          });
        } else {
          setErrors({ general: 'Não foi possível concluir. Tente novamente.' });
        }
        return;
      }

      const userData: UserProfileData = {
        fullName:
          dados?.user?.fullName || formData.fullName || formData.email.split('@')[0],
        age: formData.age,
        city: dados?.user?.city || formData.city,
        email: dados?.user?.email || formData.email,
        nickname: dados?.user?.nickname || formData.nickname || undefined,
        state: dados?.user?.state || formData.state,
        country: dados?.user?.country || formData.country,
      };

      try {
        localStorage.setItem('userData', JSON.stringify(userData));
      } catch (storageError) {
        // A sessão real é o cookie; perder o localStorage não desloga ninguém.
        console.error('Falha ao guardar o perfil localmente:', storageError);
      }

      router.push('/');
    } catch {
      setErrors({ general: 'Não foi possível falar com o servidor.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    /*
     * ESTA DIV É A ÁREA QUE ROLA.
     *
     * Antes era `h-screen ... overflow-hidden` com o cartão centrado por
     * `items-center`. No celular o cartão do cadastro é mais alto que a tela
     * (são dez campos), e o resultado era o pior dos dois mundos: centrado, ele
     * passava do limite EM CIMA e EMBAIXO ao mesmo tempo, e o `overflow-hidden`
     * tornava as duas pontas inalcançáveis — as abas "Criar Cadastro/Entrar"
     * cortadas no topo e o botão de enviar fora da tela, sem rolagem nenhuma.
     * Medido em 375x812: cartão de 973px dentro de uma caixa de 812.
     *
     * `app-viewport` é a classe que o projeto já usa para altura de tela no
     * celular (100dvh, descontando a barra do navegador). `h-screen` mede a
     * viewport GRANDE e é justamente o bug que aquele comentário no
     * globals.css descreve.
     *
     * O CENTRO AGORA VEM DE `m-auto` NO CARTÃO, e não de `items-center`. A
     * diferença aparece exatamente no caso que quebrou: com `items-center`, um
     * filho mais alto que o contêiner rolável tem o topo cortado e
     * inalcançável; com `margin: auto` ele centraliza quando cabe e encosta no
     * topo quando não cabe, continuando inteiro.
     */
    <div className="relative w-full app-viewport overflow-y-auto overflow-x-hidden flex p-2 sm:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Fundo e véu são `fixed`: a área acima rola, e eles precisam ficar
          parados cobrindo a tela. Se fossem `absolute`, subiriam junto com a
          rolagem e deixariam o fim do formulário sobre o fundo cru. */}
      <LoginBackground />
      <div className="fixed inset-0 bg-black/60 z-10" />
      <div
        className="relative z-20 m-auto w-full max-w-md bg-stone-900/90 backdrop-blur-sm
rounded-xl shadow-2xl border border-green-700 p-3.5 sm:p-5
flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-500"
      >
        <h2 className="text-xl sm:text-2xl font-extrabold text-white text-center">
          {formData.isLogin ? 'Entrar na Conta' : 'Criar Nova Conta'}
        </h2>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => setFormData((prev) => ({ ...prev, isLogin: false }))}
            className={`px-4 py-2 text-sm rounded-lg font-semibold transition-all duration-200
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
            className={`px-4 py-2 text-sm rounded-lg font-semibold transition-all duration-200
${
  formData.isLogin
    ? 'bg-green-600 text-white shadow-md'
    : 'bg-stone-700 text-gray-300 hover:bg-stone-600'
}`}
          >
            Entrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
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
                    className="flex-1 bg-transparent text-white placeholder-gray-400 py-1 px-2.5 focus:outline-none text-[15px]"
                    maxLength={170}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-red-400 text-xs mt-0.5">
                    {errors.fullName}
                  </p>
                )}
              </div>

              {/* NICKNAME. É o único campo desta tela que outras pessoas vão
                  ver: o nome completo fica guardado, o nickname é o que
                  aparece na busca do globo. */}
              <div>
                <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
                  <IconAt />
                  <input
                    type="text"
                    name="nickname"
                    placeholder="nickname (letras, números e _)"
                    value={formData.nickname}
                    onChange={handleChange}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="flex-1 bg-transparent text-white placeholder-gray-400 py-1 px-2.5 focus:outline-none text-[15px] lowercase"
                    maxLength={NICKNAME_MAX}
                  />
                </div>
                {/*
                  A dica saiu daqui e virou placeholder: uma linha de texto
                  abaixo de um campo, multiplicada por nove campos, era parte
                  do motivo de a tela nao caber. O erro continua aparecendo —
                  esse sim precisa interromper a leitura.
                */}
                {errors.nickname && (
                  <p className="text-red-400 text-xs mt-0.5">{errors.nickname}</p>
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
                    className="flex-1 bg-transparent text-white placeholder-gray-400 py-1 px-2.5 focus:outline-none text-[15px]"
                    inputMode="numeric"
                    pattern="\d{1,2}"
                    maxLength={2}
                  />
                </div>
                {errors.age && (
                  <p className="text-red-400 text-xs mt-0.5">{errors.age}</p>
                )}
              </div>

              <LocationFields
                country={formData.country}
                state={formData.state}
                city={formData.city}
                onChange={handleChange}
                errors={errors}
              />
            </>
          )}

          <div>
            <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
              <IconMail />
              <input
                type="email"
                name="email"
                placeholder="nome@gmail.com"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                inputMode="email"
                className="flex-1 bg-transparent text-white placeholder-gray-400 py-1 px-2.5 focus:outline-none text-[15px]"
                maxLength={254}
              />
            </div>
            {errors.email && (
              <p className="text-red-400 text-xs mt-0.5">{errors.email}</p>
            )}
          </div>

          <div>
            <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
              <IconLock />
              <input
                type="password"
                name="password"
                placeholder="Senha (mínimo 8 caracteres)"
                value={formData.password}
                onChange={handleChange}
                /* `new-password` no cadastro faz o gerenciador de senhas
                   oferecer uma senha forte; `current-password` na entrada faz
                   ele preencher a que já existe. Trocar os dois confunde o
                   gerenciador e a pessoa acaba salvando lixo. */
                autoComplete={formData.isLogin ? 'current-password' : 'new-password'}
                className="flex-1 bg-transparent text-white placeholder-gray-400 py-1 px-2.5 focus:outline-none text-[15px]"
                maxLength={200}
              />
            </div>
            {errors.password && (
              <p className="text-red-400 text-xs mt-0.5">{errors.password}</p>
            )}
          </div>

          {!formData.isLogin && (
            <div>
              <div className="flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors">
                <IconLock />
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Repita a senha"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-white placeholder-gray-400 py-1 px-2.5 focus:outline-none text-[15px]"
                  maxLength={200}
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-red-400 text-xs mt-0.5">
                  {errors.confirmPassword}
                </p>
              )}
            </div>
          )}

          {errors.general && (
            <p className="text-red-400 text-sm text-center">
              {errors.general}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700
text-white text-lg font-semibold shadow-lg transition-colors
focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-stone-900 focus:ring-green-500
disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {enviando
              ? 'Enviando...'
              : formData.isLogin
                ? 'Entrar'
                : 'Cadastrar e Entrar'}
          </button>
        </form>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-gray-700" />
          <span className="flex-shrink mx-4 text-gray-400 text-base">OU</span>
          <div className="flex-grow border-t border-gray-700" />
        </div>

        {/*
          O ÍCONE É SVG INLINE, e não um arquivo em public/images.

          Aqui havia um <Image src="/images/google-icon.png"> apontando para uma
          pasta que nunca existiu: toda visita a esta tela pedia a imagem e
          levava 400. Desenhado aqui, ele não pode faltar — e são as quatro
          cores que fazem o botão ser reconhecido antes de alguém ler o texto.

          É UM LINK COMUM, não um fetch: quem precisa ver a tela do Google é a
          pessoa, e o login dela mora no navegador dela. O servidor monta o
          endereço com o `state` assinado e leva junto.
        */}
        <a
          href="/api/auth/google/start"
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-white py-2.5
                     text-sm font-semibold text-gray-700 shadow-lg transition-colors
                     hover:bg-gray-100"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
            <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
            <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z" />
            <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
          </svg>
          Entrar com Google
        </a>
      </div>
    </div>
  );
};

export default LoginScreen;
