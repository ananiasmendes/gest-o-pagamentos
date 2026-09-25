'use client';

import { useEffect, useState, ReactNode, FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard, PackagePlus, ClipboardList, Wallet, ScrollText, Tags, Users, Upload, MoreHorizontal, LogOut,
} from 'lucide-react';
import { supabase, supabaseConfigurado, LOGIN_EMAIL, mensagemErro } from '@/lib/supabase';
import { DataProvider, useData } from '@/lib/data';
import { AvisosProvider, Botao, Campo, Texto, Modal, cx } from './ui';

const NAV = [
  { href: '/', rotulo: 'Painel', icone: LayoutDashboard },
  { href: '/lancar', rotulo: 'Lançar', icone: PackagePlus },
  { href: '/entradas', rotulo: 'Entradas', icone: ClipboardList },
  { href: '/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
  { href: '/extrato', rotulo: 'Extrato', icone: ScrollText },
  { href: '/precos', rotulo: 'Preços', icone: Tags },
  { href: '/cadastros', rotulo: 'Oficinas e modelos', icone: Users },
  { href: '/importar', rotulo: 'Importar', icone: Upload },
];
const NAV_CELULAR = ['/', '/entradas', '/lancar', '/pagamentos'];

function Marca() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="#B8235A" />
        <path d="M6 16h20" stroke="#fff" strokeWidth="2" strokeDasharray="3 2.5" strokeLinecap="round" />
        <circle cx="16" cy="16" r="4" fill="#F4F3F8" />
      </svg>
      <span className="font-display text-[19px] font-bold">Oficinas</span>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState(LOGIN_EMAIL);
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pin });
    if (error) setErro(mensagemErro(error));
    setEnviando(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-xs">
        <Marca />
        <h1 className="mt-8 text-[28px] font-bold leading-tight">Pagamento das oficinas</h1>
        <p className="mt-1 text-linha">Digite o PIN para entrar.</p>
        <div className="mt-6 space-y-4">
          {!LOGIN_EMAIL && (
            <Campo rotulo="E-mail"><Texto type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Campo>
          )}
          <Campo rotulo="PIN">
            <Texto
              type="password" inputMode="numeric" autoComplete="current-password" autoFocus required minLength={6}
              value={pin} onChange={(e) => setPin(e.target.value)} className="h-14 text-center text-2xl tracking-[0.5em]"
            />
          </Campo>
          {erro && <p className="text-sm font-medium text-framboesa">{erro}</p>}
          <Botao type="submit" disabled={enviando} className="w-full">{enviando ? 'Entrando…' : 'Entrar'}</Botao>
        </div>
      </form>
    </main>
  );
}

function SemConfiguracao() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <Marca />
      <h1 className="mt-8 text-2xl font-bold">Falta conectar o banco de dados</h1>
      <p className="mt-3 text-linha">
        Cadastre as variáveis <code className="font-semibold text-tinta">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
        <code className="font-semibold text-tinta">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> e{' '}
        <code className="font-semibold text-tinta">NEXT_PUBLIC_LOGIN_EMAIL</code> na Vercel
        (Settings › Environment Variables) e faça um novo deploy. O passo a passo está no README.
      </p>
    </main>
  );
}

function ErroCarga() {
  const { erro, recarregar } = useData();
  if (!erro) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-framboesa-claro px-4 py-3 text-sm text-framboesa-escuro">
      <span>Não foi possível carregar os dados: {erro}</span>
      <Botao variante="secundario" className="h-9" onClick={() => recarregar()}>Tentar de novo</Botao>
    </div>
  );
}

function Navegacao({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [mais, setMais] = useState(false);
  const ativo = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const sair = () => supabase.auth.signOut();

  return (
    <div className="min-h-screen md:flex">
      {/* Computador: barra lateral */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-borda bg-tecido px-3 py-5 md:flex">
        <div className="px-3"><Marca /></div>
        <nav className="mt-8 flex flex-1 flex-col gap-0.5">
          {NAV.map(({ href, rotulo, icone: I }) => (
            <Link key={href} href={href}
              className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors',
                ativo(href) ? 'bg-tinta text-white' : 'text-tinta hover:bg-papel')}>
              <I size={18} strokeWidth={2.2} />{rotulo}
            </Link>
          ))}
        </nav>
        <button onClick={sair} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-linha hover:bg-papel">
          <LogOut size={18} />Sair
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-6xl"><ErroCarga />{children}</div>
      </main>

      {/* Celular: barra inferior com o botão de lançar no centro */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-tecido/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          {NAV.filter((n) => NAV_CELULAR.includes(n.href)).map(({ href, rotulo, icone: I }) =>
            href === '/lancar' ? (
              <Link key={href} href={href} aria-label="Lançar entrada" className="flex flex-col items-center pb-2">
                <span className={cx('-mt-5 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg',
                  ativo(href) ? 'bg-framboesa-escuro' : 'bg-framboesa')}><I size={26} /></span>
                <span className="mt-0.5 text-[11px] font-semibold">{rotulo}</span>
              </Link>
            ) : (
              <Link key={href} href={href} className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', ativo(href) ? 'text-framboesa' : 'text-linha')}>
                <I size={22} strokeWidth={ativo(href) ? 2.4 : 2} />{rotulo}
              </Link>
            ))}
          <button onClick={() => setMais(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-linha">
            <MoreHorizontal size={22} />Mais
          </button>
        </div>
      </nav>

      <Modal aberto={mais} titulo="Mais opções" onFechar={() => setMais(false)}>
        <div className="grid gap-1">
          {NAV.filter((n) => !NAV_CELULAR.includes(n.href)).map(({ href, rotulo, icone: I }) => (
            <Link key={href} href={href} onClick={() => setMais(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3.5 text-base font-semibold hover:bg-papel">
              <I size={20} />{rotulo}
            </Link>
          ))}
          <button onClick={sair} className="flex items-center gap-3 rounded-lg px-3 py-3.5 text-base font-semibold text-linha hover:bg-papel">
            <LogOut size={20} />Sair
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseConfigurado) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigurado) return <SemConfiguracao />;
  if (sessao === undefined) return null;
  if (!sessao) return <Login />;

  return (
    <AvisosProvider>
      <DataProvider>
        <Navegacao>{children}</Navegacao>
      </DataProvider>
    </AvisosProvider>
  );
}
