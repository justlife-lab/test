'use client';
// Admin slot picker: doctor + date + free slot (uses admin availability, 90 days ahead).
import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/components/admin/useData';
import { qs } from '@/lib/client-api';
import Calendar from '@/components/client/Calendar';
import TimeSlots from '@/components/client/TimeSlot';
import { Loading } from '@/components/ui';

export default function SlotPicker({ value, onChange, excludeAppointmentId, initialDoctorId }) {
  const { data } = useData(`/api/admin/availability${qs({ excludeAppointmentId })}`);
  const [doctorId, setDoctorId] = useState(initialDoctorId || '');
  const [day, setDay] = useState('');
  const doctor = useMemo(() => data?.doctors.find((d) => d.id === doctorId), [data, doctorId]);
  const dates = doctor ? Object.keys(doctor.days).sort() : [];
  useEffect(() => { if (doctor && (!day || !doctor.days[day])) setDay(dates[0] || ''); }, [doctor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loading rows={2} />;
  return (
    <div className="stack">
      <select className="select" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); onChange(null); }} aria-label="Doctor">
        <option value="">Choose a doctor…</option>
        {data.doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialty} ({Object.keys(d.days).length} days available)</option>)}
      </select>
      {doctor && <Calendar dates={dates} counts={Object.fromEntries(dates.map((k) => [k, doctor.days[k].length]))} value={day} onChange={(k) => { setDay(k); onChange(null); }} />}
      {doctor && day && <TimeSlots slots={doctor.days[day]} value={value?.startAt} onChange={(s) => onChange({ ...s, doctorId: doctor.id, doctorName: doctor.name })} />}
    </div>
  );
}
