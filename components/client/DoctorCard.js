'use client';
import { Avatar } from '@/components/ui';
import { relativeDayLabel } from '@/lib/time';

export function experienceLabel(y) {
  return y ? `${y}+ years experience` : 'Experienced clinician';
}

/** Client doctor card: photo, name, specialty, languages, bio, experience, next available dates. */
export default function DoctorCard({ doctor, selected, onSelect, onViewProfile }) {
  const dates = Object.keys(doctor.days || {}).sort();
  const slotCount = dates.reduce((n, k) => n + doctor.days[k].length, 0);
  return (
    <article className="doctor-card" aria-selected={selected ? 'true' : 'false'}>
      <div className="top">
        <Avatar src={doctor.photoUrl} name={doctor.name} />
        <div style={{ minWidth: 0 }}>
          <h3>{doctor.name}</h3>
          <div className="spec">{doctor.specialty}</div>
        </div>
      </div>
      <div className="facts">
        <span className="fact">{experienceLabel(doctor.experienceYears)}</span>
        {doctor.languages?.length > 0 && <span className="fact">{doctor.languages.join(' | ')}</span>}
      </div>
      {doctor.bio && <p className="bio">{doctor.bio}</p>}
      <div className="avail-days">
        <span className="muted">Available:</span>
        {dates.slice(0, 3).map((k) => <b key={k}>{relativeDayLabel(k)}</b>)}
        {dates.length > 3 && <span className="muted">+{dates.length - 3} more days</span>}
        <span className="muted">({slotCount} slots)</span>
      </div>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => onViewProfile(doctor)}>View profile</button>
        <button type="button" className="btn btn-sm btn-primary grow" onClick={() => onSelect(doctor)}>
          {selected ? 'Selected' : 'Choose this doctor'}
        </button>
      </div>
    </article>
  );
}
