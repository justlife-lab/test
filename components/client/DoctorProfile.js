'use client';
import { Avatar, Modal } from '@/components/ui';
import { experienceLabel } from './DoctorCard';

const durationLabel = (m) => (m % 60 === 0 ? `${m / 60} Hour${m === 60 ? '' : 's'}` : `${m} minutes`);

export default function DoctorProfile({ doctor, onClose, onBook }) {
  return (
    <Modal title="Doctor profile" onClose={onClose}>
      <div className="row" style={{ gap: 16, marginBottom: 16 }}>
        <Avatar src={doctor.photoUrl} name={doctor.name} size="lg" />
        <div>
          <h2 style={{ marginBottom: 2 }}>{doctor.name}</h2>
          <div className="muted">{doctor.specialty}</div>
          <div className="small muted">{experienceLabel(doctor.experienceYears)}</div>
        </div>
      </div>
      <dl className="summary-list">
        <div><dt>Languages</dt><dd>{doctor.languages?.join(' | ') || '—'}</dd></div>
        <div><dt>Consultation type</dt><dd>{doctor.consultationType}</dd></div>
        <div><dt>Teleconsultation duration</dt><dd>{durationLabel(doctor.consultationMinutes)}</dd></div>
      </dl>
      {doctor.bio && <p style={{ marginTop: 14 }}>{doctor.bio}</p>}
      <div className="notice" style={{ margin: '14px 0' }}>
        The doctor will contact you within the selected {durationLabel(doctor.consultationMinutes).toLowerCase()} time window.
      </div>
      {onBook && <button className="btn btn-primary btn-block btn-lg" onClick={() => onBook(doctor)}>Book Consultation</button>}
    </Modal>
  );
}
