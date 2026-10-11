import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useOnline } from '../lib/useOnline';
import { Icon, Mark, type IconName } from './Icon';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Hoje', icon: 'today' },
  { href: '/remedios', label: 'Remédios', icon: 'pill' },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings' },
];

function isActive(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path.startsWith(href);
}

/** Navegação: barra embaixo no celular, trilho no tablet, lateral no desktop. */
export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const online = useOnline();

  return (
    <div className="shell">
      <nav className="nav" aria-label="Principal">
        <Link href="/" className="nav-marca" aria-label="Boldo, início">
          <Mark size={40} />
          <span className="nav-nome">Boldo</span>
        </Link>
        <ul className="nav-lista">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="nav-item"
                aria-current={isActive(item.href, path) ? 'page' : undefined}
              >
                <Icon name={item.icon} size={24} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="conteudo">
        {!online && (
          <p className="aviso-offline" role="status">
            Sem conexão. O que você vê pode estar desatualizado.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
