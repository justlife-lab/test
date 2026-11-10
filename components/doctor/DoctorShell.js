'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { BrandMark, ToastProvider } from '@/components/ui';
import { IconSun, IconSunrise, IconWeek, IconCalendar, IconCheck, IconUser, IconLogout } from '@/components/Icons';

const NAV = [
  ['/doctor', 'Today', IconSun],
  ['/doctor/tomorrow', 'Tomorrow', IconSunrise],
  ['/doctor/week', 'Next 7 Days', IconWeek],
  ['/doctor/calendar', 'Calendar', IconCalendar],
  ['/doctor/completed', 'Completed', IconCheck],
  ['/doctor/profile', 'Profile', IconUser],
];

export default function DoctorShell({ user, children }) {
  const path = usePathname();
  const active = (href) => (href === '/doctor' ? path === '/doctor' : path.startsWith(href));
  return (
    <ToastProvider>
      <div className="app-shell">
        <nav className="sidebar" aria-label="Doctor portal">
          <span className="brand"><BrandMark />Doctor Portal</span>
          {NAV.map(([href, label, Icon]) => (
            <Link key={href} href={href} className="nav-link" aria-current={active(href) ? 'page' : undefined}><Icon />{label}</Link>
          ))}
          <div className="me">
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div className="tiny muted">{user.email}</div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, paddingInline: 0 }} onClick={() => signOut({ callbackUrl: '/doctor/login' })}><IconLogout width={16} /> Sign out</button>
          </div>
        </nav>
        <div style={{ minWidth: 0 }}>
          <header className="topbar">
            <span className="brand"><BrandMark />{user.name}</span>
            <span className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => signOut({ callbackUrl: '/doctor/login' })}>Sign out</button>
          </header>
          <main className="content doctor-content">{children}</main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Doctor portal">
        {NAV.map(([href, label, Icon]) => (
          <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}><Icon />{label}</Link>
        ))}
      </nav>
    </ToastProvider>
  );
}
