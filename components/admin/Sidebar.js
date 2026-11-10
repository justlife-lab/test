'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { BrandMark, ToastProvider } from '@/components/ui';
import {
  IconDashboard, IconDoctor, IconCalendar, IconList, IconUsers, IconChart, IconTrophy, IconSettings,
  IconLink, IconMail, IconShield, IconMenu, IconLogout,
} from '@/components/Icons';

const NAV = [
  ['/admin', 'Dashboard', IconDashboard],
  ['/admin/doctors', 'Doctors', IconDoctor],
  ['/admin/calendar', 'Calendar', IconCalendar],
  ['/admin/bookings', 'Bookings', IconList],
  ['/admin/clients', 'Clients', IconUsers],
  ['/admin/reports', 'Reports', IconChart],
  ['/admin/performance', 'Doctor Performance', IconTrophy],
  ['/admin/settings', 'Settings', IconSettings],
];
const TOOLS = [
  ['/admin/links', 'Booking links', IconLink],
  ['/admin/emails', 'Email log', IconMail],
  ['/admin/audit', 'Audit log', IconShield],
];

function Nav({ user, onNavigate }) {
  const path = usePathname();
  const isActive = (href) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  const item = ([href, label, Icon]) => (
    <Link key={href} href={href} className="nav-link" aria-current={isActive(href) ? 'page' : undefined} onClick={onNavigate}>
      <Icon />{label}
    </Link>
  );
  return (
    <nav className="sidebar" aria-label="Admin">
      <span className="brand"><BrandMark />Justlife Admin</span>
      {NAV.map(item)}
      <div className="nav-sep">Tools</div>
      {TOOLS.map(item)}
      <div className="me">
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || 'Admin'}</div>
        <div className="muted tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, paddingInline: 0 }} onClick={() => signOut({ callbackUrl: '/login' })}><IconLogout width={16} /> Sign out</button>
      </div>
    </nav>
  );
}

/** Admin chrome: sidebar on desktop, drawer on tablet/mobile. */
export default function AdminShell({ user, children }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <ToastProvider>
      <div className="app-shell">
        <Nav user={user} />
        <div style={{ minWidth: 0 }}>
          <header className="topbar">
            <button className="menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><IconMenu width={20} /></button>
            <span className="brand"><BrandMark />Admin</span>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
      {open && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
          <Nav user={user} onNavigate={() => setOpen(false)} />
          <div className="scrim" onClick={() => setOpen(false)} />
        </div>
      )}
    </ToastProvider>
  );
}
