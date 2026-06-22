import { useEffect, useState } from 'react';
import { LogIn, UserRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from '../state/appStore';
import { resolveTheme } from '../theme';
import WindowControls from '../components/WindowControls';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const session = useAppStore((state) => state.session);
  const appTheme = useAppStore((state) => state.appTheme);
  const continueAsGuest = useAppStore((state) => state.continueAsGuest);
  const loginWithEmail = useAppStore((state) => state.loginWithEmail);
  const navigate = useNavigate();
  const brandLogoSrc = resolveTheme(appTheme).logos.primary;

  useEffect(() => {
    if (session) navigate('/home', { replace: true });
  }, [navigate, session]);

  if (session) return <Navigate to="/home" replace />;

  const handleGuest = async () => {
    await continueAsGuest();
    navigate('/home', { replace: true });
  };

  const handleEmail = async () => {
    await loginWithEmail(email || 'local@myanime1996.invalid', password);
    navigate('/home', { replace: true });
  };

  return (
    <main className="app-noise relative grid min-h-screen place-items-center bg-ink p-6 text-cream">
      <div className="absolute left-3 top-3 z-[10030]" data-tauri-drag-region="false">
        <WindowControls />
      </div>
      <section className="app-card grid w-full max-w-5xl grid-cols-[1.1fr_0.9fr] overflow-hidden max-md:grid-cols-1">
        <div className="relative min-h-[620px] overflow-hidden bg-black/35 p-8 max-md:min-h-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(232,184,115,0.2),transparent_24rem)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <img src={brandLogoSrc} alt="My Anime" className="logo-glow w-full max-w-xl" />
            <div>
              <p className="eyebrow mb-4">Desktop archive / local session</p>
              <h1 className="font-display text-4xl font-semibold uppercase leading-tight text-cream max-md:text-3xl">
                Tune into your late-night anime shelf.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-6 text-cream/65">
                Guest mode creates an anonymous local session with Tauri Store. Email/password fields are prototype UI only and never leave this machine.
              </p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="app-card p-6">
            <p className="eyebrow">Mandatory login</p>
            <h2 className="mt-2 font-display text-3xl font-semibold uppercase">Access deck</h2>
            <div className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-[0.12em] text-amberline/75">Email optional</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-cream/15 bg-ink/70 px-4 py-3 font-mono text-cream outline-none focus:border-amberline/70"
                  placeholder="name@local.tape"
                  type="email"
                />
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-[0.12em] text-amberline/75">Password optional</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-cream/15 bg-ink/70 px-4 py-3 font-mono text-cream outline-none focus:border-amberline/70"
                  placeholder="Stored locally only"
                  type="password"
                />
              </label>
            </div>
            <div className="mt-8 grid gap-3">
              <button type="button" onClick={handleGuest} className="vhs-button w-full retro-tooltip" data-tooltip="Continue as Guest">
                <UserRound size={18} /> Continue as Guest
              </button>
              <button type="button" onClick={handleEmail} className="vhs-button-ghost w-full py-3 retro-tooltip" data-tooltip="Use Local Email Session">
                <LogIn size={17} /> Use Local Email Session
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
