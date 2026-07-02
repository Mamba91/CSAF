import { ReactNode } from 'react';
import { useLang } from '../lib/i18n';

export function SeverityBadge({ severity, score }: { severity?: string; score?: number | null }) {
  const s = (severity || '').toUpperCase();
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    CRITICAL: { bg: 'rgba(224,85,85,0.15)', color: '#e05555', border: 'rgba(224,85,85,0.35)' },
    HIGH:     { bg: 'rgba(224,165,80,0.15)', color: 'var(--warn)', border: 'rgba(224,165,80,0.35)' },
    MEDIUM:   { bg: 'rgba(224,195,80,0.15)', color: '#c8a520', border: 'rgba(224,195,80,0.35)' },
    LOW:      { bg: 'rgba(76,140,200,0.15)', color: '#4c8cc8', border: 'rgba(76,140,200,0.35)' },
    NONE:     { bg: 'var(--bg-subtle)',       color: 'var(--text-2)', border: 'var(--border)' },
  };
  const st = styles[s] || styles.NONE;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold"
      style={{ background: st.bg, color: st.color, borderColor: st.border }}
    >
      {s || '—'}
      {score != null && <span className="mono opacity-80">{Number(score).toFixed(1)}</span>}
    </span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    slate:  { bg: 'var(--bg-subtle)',      color: 'var(--text-2)' },
    accent: { bg: 'var(--accent-muted)',   color: 'var(--accent-h)' },
    green:  { bg: 'rgba(76,175,125,0.15)', color: 'var(--success)' },
  };
  const st = styles[tone] || styles.slate;
  return (
    <span className="rounded-md px-2 py-0.5 text-xs" style={{ background: st.bg, color: st.color }}>
      {children}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
    >
      <div className="text-base" style={{ color: 'var(--text-2)' }}>{title}</div>
      {hint && <div className="mt-1.5 text-sm" style={{ color: 'var(--text-3)' }}>{hint}</div>}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, width = 'max-w-lg',
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className={`card w-full ${width} p-6 shadow-2xl`}
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm transition"
            style={{ color: 'var(--text-2)', background: 'var(--bg-hover)' }}
          >✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 py-10" style={{ color: 'var(--text-2)' }}>
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
      {label || t('loading')}
    </div>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onClose,
}: {
  open: boolean; title: string; message: string;
  confirmLabel?: string; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useLang();
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm" style={{ color: 'var(--text-2)' }}>{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-danger" onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel ?? t('delete')}
        </button>
      </div>
    </Modal>
  );
}

export const VULN_STATUS: Record<string, { bg: string; color: string; border: string }> = {
  open:           { bg: 'rgba(224,85,85,0.12)',    color: 'var(--danger)',  border: 'rgba(224,85,85,0.3)' },
  in_progress:    { bg: 'rgba(224,165,80,0.12)',   color: 'var(--warn)',    border: 'rgba(224,165,80,0.3)' },
  resolved:       { bg: 'rgba(76,175,125,0.12)',   color: 'var(--success)', border: 'rgba(76,175,125,0.3)' },
  accepted:       { bg: 'rgba(124,109,242,0.12)',  color: 'var(--accent-h)',border: 'rgba(124,109,242,0.3)' },
  false_positive: { bg: 'var(--bg-subtle)',         color: 'var(--text-2)', border: 'var(--border)' },
};
export const TREATED_STATUSES = ['resolved', 'accepted', 'false_positive'];

export const PROJECT_STATUS: Record<string, { bg: string; color: string; border: string }> = {
  sain:      { bg: 'rgba(76,175,125,0.12)',  color: 'var(--success)', border: 'rgba(76,175,125,0.3)' },
  a_traiter: { bg: 'rgba(224,85,85,0.12)',   color: 'var(--danger)',  border: 'rgba(224,85,85,0.3)' },
  en_cours:  { bg: 'rgba(224,165,80,0.12)',  color: 'var(--warn)',    border: 'rgba(224,165,80,0.3)' },
  traite:    { bg: 'rgba(76,175,125,0.12)',  color: 'var(--success)', border: 'rgba(76,175,125,0.3)' },
};

export function ProjectStatusBadge({ status }: { status: string }) {
  const { t } = useLang();
  const s = PROJECT_STATUS[status] || PROJECT_STATUS.sain;
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {t('pstatus_' + status)}
    </span>
  );
}

export function ImportProgress({ label, done, total }: { label?: string; done?: number; total?: number }) {
  const det = typeof done === 'number' && typeof total === 'number' && total > 0;
  const pct = det ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-2)' }}>
        {label && <span>{label}</span>}
        {det && <span className="mono">{done}/{total}</span>}
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <style>{`@keyframes imp-slide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
        {det ? (
          <div className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        ) : (
          <div className="absolute h-full w-1/4 rounded-full"
            style={{ background: 'var(--accent)', animation: 'imp-slide 1.4s ease-in-out infinite' }} />
        )}
      </div>
    </div>
  );
}

export function formatDate(d?: string | null, locale = 'fr-FR') {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch { return d; }
}
