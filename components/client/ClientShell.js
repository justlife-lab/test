// Header + container for client-facing pages (no admin chrome).
import { BrandMark } from '@/components/ui';
import CONFIG from '@/config/config';

export default function ClientShell({ children }) {
  return (
    <div className="client-shell">
      <header className="client-header">
        <div className="inner">
          <span className="brand"><BrandMark />{CONFIG.BRAND_NAME}</span>
          <span className="small muted">Teleconsultation</span>
        </div>
      </header>
      <main className="client-main">{children}</main>
    </div>
  );
}
