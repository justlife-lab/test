'use client';
import { Avatar, TimeWindow, CONTACT_LABEL } from '@/components/ui';
import { formatDateLong } from '@/lib/time';

/** The "ticket" shown after booking or rescheduling. */
export default function BookingConfirmation({ title = 'Teleconsultation Confirmed', intro, booking, children }) {
  return (
    <div>
      <div className="check-circle" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
      </div>
      <h1>{title}</h1>
      {intro && <p className="muted">{intro}</p>}
      <div className="ticket" style={{ marginTop: 18 }}>
        <div className="head">
          <div className="label">{formatDateLong(booking.startAt)}</div>
          <TimeWindow startAt={booking.startAt} endAt={booking.endAt} size="xl" />
          <div className="small" style={{ marginTop: 6 }}>UAE time · your doctor will contact you during this window</div>
        </div>
        <div className="body">
          <div className="row">
            <Avatar src={booking.doctor.photoUrl} name={booking.doctor.name} />
            <div>
              <strong>{booking.doctor.name}</strong>
              <div className="small muted">{booking.doctor.specialty}</div>
            </div>
          </div>
          <div className="perf" />
          <dl>
            <dt>Contact method</dt><dd>{CONTACT_LABEL[booking.contactMethod]}</dd>
            <dt>Booking reference</dt><dd>{booking.appointmentNo}</dd>
            <dt>Justlife reference</dt><dd>{booking.bookingReference}</dd>
          </dl>
        </div>
      </div>
      <div className="notice" style={{ marginTop: 16 }}>
        Your doctor will contact you during the selected 1-hour time window. Please keep your phone available during this period.
      </div>
      {children}
    </div>
  );
}
