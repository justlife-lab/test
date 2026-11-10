'use client';
// =============================================================================
// Master calendar — Day (doctors as columns), Week, Month.
// Drag a scheduled booking onto another doctor / time / day to reschedule.
// The server validates working hours, off days, leave, blocked time and
// clashes; if the move is invalid it is rejected with
// "This doctor is not available during the selected time."
// (On touch devices, tap a booking → Open booking → Reschedule.)
// =============================================================================
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useData } from '@/components/admin/useData';
import { api, qs } from '@/lib/client-api';
import { Avatar, Loading, Modal, StatusBadge, useToast, CONTACT_LABEL } from '@/components/ui';
import {
  dateKey, addDays, startOfWeek, startOfMonth, endOfMonth, eachDay, clockTime, minutesOf, toUtc,
  formatKeyShort, formatKeyWeekday, formatKeyDayMonth, formatDateWeekday, formatRange, hhmmOf,
} from '@/lib/time';
import CONFIG from '@/config/config';

const H0 = CONFIG.CALENDAR_START_HOUR;
const H1 = CONFIG.CALENDAR_END_HOUR;
const HOURS = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
const HOUR_H = 88; // tall enough for time, client, booking ID and status
const LEGEND = [
  ['Available', '#ffffff'], ['Booked', '#e3f7ff'], ['Calling', '#efebfc'], ['Completed', '#e3f6ee'],
  ['Cancelled', '#fdeaea'], ['No Show', '#eef2f4'], ['Rescheduled', '#fff4dc'], ['Unavailable', '#f5f7f8'],
];

function rangeFor(view, anchor) {
  if (view === 'day') return [anchor, anchor];
  if (view === 'week') { const s = startOfWeek(anchor); return [s, addDays(s, 6)]; }
  const s = startOfWeek(startOfMonth(anchor));
  const e = addDays(startOfWeek(endOfMonth(anchor)), 6);
  return [s, e];
}

function isOpen(windows, doctorId, key, hour) {
  const ws = windows?.[doctorId]?.[key] || [];
  const s = hour * 60;
  return ws.some((w) => minutesOf(w.start) < s + 60 && minutesOf(w.end) > s);
}

function CalendarInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState(sp.get('view') || 'day');
  const [anchor, setAnchor] = useState(sp.get('date') || dateKey());
  const [doctorId, setDoctorId] = useState(sp.get('doctorId') || '');
  const [showInactive, setShowInactive] = useState(false);
  const [hideClosed, setHideClosed] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [pending, setPending] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const [from, to] = rangeFor(view, anchor);
  const { data, reload, error } = useData(`/api/admin/calendar${qs({ from, to, doctorId, showInactive: showInactive ? 1 : '' })}`);
  const { data: allDoctors } = useData('/api/admin/doctors');

  const appts = useMemo(() => (data?.appointments || []).filter((a) => !hideClosed || !['CANCELLED', 'RESCHEDULED'].includes(a.status)), [data, hideClosed]);
  const doctorName = (id) => data?.doctors.find((d) => d.id === id)?.name || allDoctors?.find((d) => d.id === id)?.name || '';
  const step = (n) => setAnchor(view === 'day' ? addDays(anchor, n) : view === 'week' ? addDays(anchor, 7 * n) : addDays(startOfMonth(anchor), n > 0 ? 32 : -1).slice(0, 8) + '01');

  function onDrop(target) {
    const a = appts.find((x) => x.id === dragId);
    setDragId(null); setOver(null);
    if (!a) return;
    const startAt = toUtc(target.key, target.time ?? clockTime(a.startAt));
    if (a.doctorId === target.doctorId && +startAt === +new Date(a.startAt)) return;
    setPending({ appt: a, doctorId: target.doctorId, startAt, reason: '' });
  }

  async function confirmMove() {
    setBusy(true);
    try {
      await api(`/api/admin/bookings/${pending.appt.id}/move`, {
        method: 'POST', body: { doctorId: pending.doctorId, startAt: pending.startAt.toISOString(), reason: pending.reason || null, viaDrag: true },
      });
      toast('Booking moved. The client has been emailed the new time.');
      setPending(null); reload();
    } catch (e) {
      toast(e.message || 'This doctor is not available during the selected time.', 'error');
      setPending(null);
    } finally { setBusy(false); }
  }

  const dragProps = (a) => (a.status === 'SCHEDULED' ? {
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; setDragId(a.id); },
    onDragEnd: () => { setDragId(null); setOver(null); },
  } : {});
  const dropProps = (target, open) => ({
    onDragOver: (e) => { if (dragId) { e.preventDefault(); setOver({ ...target, open }); } },
    onDragLeave: () => setOver(null),
    onDrop: (e) => { e.preventDefault(); onDrop(target); },
  });
  const overClass = (t) => (over && dragId && over.doctorId === t.doctorId && over.key === t.key && over.time === t.time ? (over.open ? ' drop-ok' : ' drop-bad') : '');

  function Event({ a, showDoctor }) {
    const s = new Date(a.startAt); const e = new Date(a.endAt);
    const top = ((minutesOf(clockTime(s)) - H0 * 60) / 60) * HOUR_H;
    const height = Math.max(26, ((e - s) / 3_600_000) * HOUR_H - 4);
    return (
      <div className={`cal-event s-${a.status}${dragId === a.id ? ' dragging' : ''}`} style={{ top: top + 2, height }}
        onClick={() => setDetail(a)} title={`${a.clientName} · ${a.appointmentNo}`} {...dragProps(a)}>
        <div className="t">{clockTime(s)} – {clockTime(e)}</div>
        {showDoctor && <div>{doctorName(a.doctorId)}</div>}
        <div style={{ fontWeight: 600 }}>{a.clientName}</div>
        <div>{a.appointmentNo}</div>
        <StatusBadge status={a.status} />
      </div>
    );
  }

  // ---- Day & week grid: each column = {doctorId, key}
  function TimeGrid({ columns, showDoctor }) {
    const today = dateKey();
    const nowMin = minutesOf(clockTime(new Date()));
    return (
      <div className="cal-scroll">
        <div className="cal-grid" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(150px, 1fr))`, '--hour-h': `${HOUR_H}px` }}>
          <div className="cal-head corner" />
          {columns.map((c) => (
            <div className="cal-head" key={c.id}>
              {c.doctor && <Avatar src={c.doctor.photoUrl} name={c.doctor.name} size="sm" />}
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                <div className="tiny muted">{c.sub}</div>
              </div>
            </div>
          ))}
          <div className="cal-times">{HOURS.map((h) => <div className="cal-time" key={h}>{hhmmOf(h * 60)}</div>)}</div>
          {columns.map((c) => (
            <div className="cal-col" key={c.id}>
              {HOURS.map((h) => {
                const target = { doctorId: c.doctorId, key: c.key, time: hhmmOf(h * 60) };
                const open = c.doctorId ? isOpen(data.windows, c.doctorId, c.key, h) : true;
                return <div key={h} className={`cal-cell${open ? ' open' : ''}${overClass(target)}`} {...(c.doctorId ? dropProps(target, open) : {})} />;
              })}
              {c.key === today && nowMin >= H0 * 60 && nowMin < H1 * 60 && <div className="now-line" style={{ top: ((nowMin - H0 * 60) / 60) * HOUR_H }} />}
              {c.events.map((a) => <Event key={a.id} a={a} showDoctor={showDoctor} />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function render() {
    if (!data) return <Loading rows={4} />;
    if (view === 'day') {
      if (!data.doctors.length) return <div className="card empty"><h3>No active doctors</h3><Link href="/admin/doctors">Add a doctor</Link></div>;
      return <TimeGrid columns={data.doctors.map((d) => ({
        id: d.id, doctorId: d.id, key: anchor, doctor: d, title: d.name, sub: d.specialty,
        events: appts.filter((a) => a.doctorId === d.id && dateKey(a.startAt) === anchor),
      }))} />;
    }
    if (view === 'week') {
      const days = eachDay(from, to);
      if (doctorId) {
        return <TimeGrid columns={days.map((k) => ({
          id: k, doctorId, key: k, title: `${formatKeyWeekday(k)} ${formatKeyDayMonth(k)}`, sub: doctorName(doctorId),
          events: appts.filter((a) => dateKey(a.startAt) === k),
        }))} />;
      }
      // All doctors: no drop target doctor per column → drag keeps the booking's doctor.
      return (
        <>
          <p className="small muted">Showing all doctors. Drag a booking to another day/time to move it with the same doctor, or pick a doctor to see their working hours.</p>
          <div className="cal-scroll">
            <div className="cal-grid" style={{ gridTemplateColumns: `64px repeat(7, minmax(150px, 1fr))`, '--hour-h': `${HOUR_H}px` }}>
              <div className="cal-head corner" />
              {days.map((k) => <div className="cal-head" key={k}>{formatKeyWeekday(k)} {formatKeyDayMonth(k)}</div>)}
              <div className="cal-times">{HOURS.map((h) => <div className="cal-time" key={h}>{hhmmOf(h * 60)}</div>)}</div>
              {days.map((k) => {
                const evs = appts.filter((a) => dateKey(a.startAt) === k);
                const dragged = appts.find((a) => a.id === dragId);
                return (
                  <div className="cal-col" key={k}>
                    {HOURS.map((h) => {
                      const target = dragged ? { doctorId: dragged.doctorId, key: k, time: hhmmOf(h * 60) } : { key: k };
                      const open = dragged ? isOpen(data.windows, dragged.doctorId, k, h) : true;
                      return <div key={h} className={`cal-cell open${dragged ? overClass(target) : ''}`} {...(dragged ? dropProps(target, open) : {})} />;
                    })}
                    {evs.map((a, i) => <div key={a.id} style={{ position: 'absolute', inset: 0, left: `${(i % 2) * 50}%`, width: evs.length > 1 ? '50%' : '100%', pointerEvents: 'none' }}><div style={{ pointerEvents: 'auto' }}><Event a={a} showDoctor /></div></div>)}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      );
    }
    // month
    const days = eachDay(from, to);
    const month = anchor.slice(0, 7);
    const today = dateKey();
    return (
      <div className="cal-scroll">
        <div className="month-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="month-dow" key={d}>{d}</div>)}
          {days.map((k) => {
            const evs = appts.filter((a) => dateKey(a.startAt) === k);
            const dragged = appts.find((a) => a.id === dragId);
            const target = dragged ? { doctorId: dragged.doctorId, key: k, time: clockTime(dragged.startAt) } : null;
            return (
              <div key={k} className={`month-cell${k.slice(0, 7) !== month ? ' other' : ''}${k === today ? ' today' : ''}${target ? overClass(target) : ''}`}
                {...(target ? dropProps(target, true) : {})}>
                <button className="dnum" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => { setView('day'); setAnchor(k); }}>{Number(k.slice(8))}</button>
                {evs.slice(0, 4).map((a) => (
                  <span key={a.id} className={`month-pill s-${a.status}`} onClick={() => setDetail(a)} {...dragProps(a)}>
                    {clockTime(a.startAt)} {doctorName(a.doctorId).replace(/^Dr\.?\s*/, '')} · {a.clientName}
                  </span>
                ))}
                {evs.length > 4 && <button className="btn-ghost tiny" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => { setView('day'); setAnchor(k); }}>+{evs.length - 4} more</button>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const title = view === 'day' ? formatDateWeekday(toUtc(anchor, '12:00')) : view === 'week' ? `${formatKeyShort(from)} – ${formatKeyShort(to)}` : new Date(`${anchor.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <div className="page-head">
        <div><h1>Calendar</h1><p>{title}</p></div>
        <Link className="btn btn-primary" href="/admin/bookings/new">New booking</Link>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="View">
          {['day', 'week', 'month'].map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-sm" onClick={() => step(-1)} aria-label="Previous">‹</button>
          <button className="btn btn-sm" onClick={() => setAnchor(dateKey())}>Today</button>
          <button className="btn btn-sm" onClick={() => step(1)} aria-label="Next">›</button>
        </div>
        <input className="input input-sm" type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} aria-label="Go to date" style={{ width: 160 }} />
        <select className="select select-sm" style={{ width: 'auto' }} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
          <option value="">All doctors</option>
          {(allDoctors || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={!hideClosed} onChange={(e) => setHideClosed(!e.target.checked)} /> Show cancelled &amp; rescheduled</label>
        {view === 'day' && <label className="check small"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive doctors</label>}
      </div>
      <div className="cal-legend">{LEGEND.map(([l, c]) => <span key={l} style={{ '--c': c }}>{l}</span>)}</div>
      {error && <div className="notice error">{error}</div>}
      {render()}

      {pending && (
        <Modal title="Move this booking?" onClose={() => setPending(null)}>
          <dl className="dl">
            <dt>Booking</dt><dd>{pending.appt.appointmentNo} · {pending.appt.clientName}</dd>
            <dt>From</dt><dd>{doctorName(pending.appt.doctorId)} / {formatDateWeekday(pending.appt.startAt)} {formatRange(pending.appt.startAt, pending.appt.endAt)}</dd>
            <dt>To</dt><dd>{doctorName(pending.doctorId)} / {formatDateWeekday(pending.startAt)} {clockTime(pending.startAt)}</dd>
          </dl>
          <input className="input" style={{ margin: '14px 0' }} placeholder="Reason (optional, saved to audit log)" value={pending.reason} onChange={(e) => setPending({ ...pending, reason: e.target.value })} />
          <p className="small muted">Availability is checked again before saving. The client receives an updated confirmation email.</p>
          <div className="row">
            <button className="btn grow" onClick={() => setPending(null)}>Keep as is</button>
            <button className="btn btn-primary grow" onClick={confirmMove} disabled={busy}>{busy ? 'Checking…' : 'Move booking'}</button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.clientName} onClose={() => setDetail(null)}>
          <dl className="dl">
            <dt>Time</dt><dd>{formatDateWeekday(detail.startAt)}, {formatRange(detail.startAt, detail.endAt)}</dd>
            <dt>Doctor</dt><dd>{doctorName(detail.doctorId)}</dd>
            <dt>Booking ID</dt><dd>{detail.appointmentNo}</dd>
            <dt>Justlife ref</dt><dd>{detail.bookingReference}</dd>
            <dt>Contact</dt><dd>{CONTACT_LABEL[detail.contactMethod]}</dd>
            <dt>Status</dt><dd><StatusBadge status={detail.status} /></dd>
          </dl>
          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => router.push(`/admin/bookings/${detail.id}`)}>Open booking</button>
        </Modal>
      )}
    </>
  );
}

export default function CalendarPage() {
  return <Suspense><CalendarInner /></Suspense>;
}
