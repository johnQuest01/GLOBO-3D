// app/handler/[...stack]/page.tsx
// Rota do Neon Auth (login, cadastro, callback OAuth, etc.).
import { StackHandler } from '@stackframe/stack';
import { stackServerApp } from '@/lib/auth/stack';

export default function Handler(props: {
  params: Promise<{ stack: string[] }>;
  searchParams: Promise<Record<string, string>>;
}) {
  if (!stackServerApp) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        Autenticação (Neon Auth) ainda não configurada. Veja docs/BACKEND_SETUP.md.
      </div>
    );
  }
  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
