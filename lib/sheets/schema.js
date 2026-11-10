// =============================================================================
// Google Sheets "database" schema.
//
// Every table is one tab in the spreadsheet. Row 1 holds the column keys
// below; the app maps columns BY HEADER NAME, so you may reorder columns or
// add your own extra columns in the sheet without breaking anything.
// Missing tabs/columns are created automatically on first use.
//
// Cell formats
//   ts     ISO-8601 UTC timestamp, e.g. 2026-11-10T06:00:00.000Z
//   date   Dubai calendar date YYYY-MM-DD
//   bool   TRUE / FALSE
//   int[]  comma list, e.g. 0,6        text[]  comma list, e.g. English, Arabic
//   json   JSON text
//   empty cell = no value (null)
//
// Deleted rows are "tombstoned": column A is set to #deleted and the rest is
// cleared. Rows are never physically removed by the app, so row positions
// stay stable. (Justlife menu ▸ Compact removes tombstones during quiet hours.)
//
// Plain module (no Next.js aliases) so CLI scripts can import it too.
// =============================================================================

export const TOMBSTONE = '#deleted';

const t = (tab, columns, extra = {}) => ({ tab, columns, ...extra });

export const TABLES = {
  users: t('Users', {
    id: 'text', email: 'text', name: 'text', role: 'text', status: 'text',
    passwordHash: 'text', doctorId: 'text', createdAt: 'ts', updatedAt: 'ts', lastLogin: 'ts',
  }, { defaults: { status: 'ACTIVE' } }),

  doctors: t('Doctors', {
    id: 'text', name: 'text', email: 'text', specialty: 'text', status: 'text',
    mobile: 'text', phoneNumber: 'text', whatsappNumber: 'text',
    languages: 'text[]', experienceYears: 'int', bio: 'text',
    consultationType: 'text', consultationMinutes: 'int', weeklyOffDays: 'int[]',
    photoFileId: 'text', photoVersion: 'int', sortOrder: 'int', createdAt: 'ts', updatedAt: 'ts',
  }, {
    defaults: {
      status: 'ACTIVE', languages: [], experienceYears: 0, consultationType: 'Teleconsultation',
      consultationMinutes: 60, weeklyOffDays: [], photoVersion: 0, sortOrder: 0,
    },
  }),

  doctorSchedules: t('DoctorSchedules', {
    id: 'text', doctorId: 'text', dayOfWeek: 'int', startTime: 'text', endTime: 'text',
  }, { timestamps: false }),

  doctorLeaves: t('DoctorLeaves', {
    id: 'text', doctorId: 'text', date: 'date', reason: 'text', createdAt: 'ts',
  }, { updatedAt: false }),

  blockedSlots: t('BlockedSlots', {
    id: 'text', doctorId: 'text', startAt: 'ts', endAt: 'ts', reason: 'text', createdBy: 'text', createdAt: 'ts',
  }, { updatedAt: false }),

  clients: t('Clients', {
    id: 'text', name: 'text', email: 'text', mobile: 'text', bookingReference: 'text',
    dateOfBirth: 'date', gender: 'text', createdAt: 'ts', updatedAt: 'ts',
  }),

  bookingLinks: t('BookingLinks', {
    id: 'text', token: 'text', status: 'text', label: 'text', justlifeReference: 'text',
    expiresAt: 'ts', singleUse: 'bool', usesCount: 'int', usedAt: 'ts',
    createdById: 'text', createdByEmail: 'text', createdAt: 'ts',
  }, { defaults: { status: 'ACTIVE', singleUse: false, usesCount: 0 }, updatedAt: false }),

  appointments: t('Appointments', {
    id: 'text', appointmentNo: 'text', bookingReference: 'text', status: 'text',
    clientId: 'text', doctorId: 'text', startAt: 'ts', endAt: 'ts',
    contactMethod: 'text', source: 'text', clientNotes: 'text', adminNotes: 'text',
    bookingLinkId: 'text', rescheduleToken: 'text', rescheduleCount: 'int',
    rescheduledFromId: 'text', rescheduleReason: 'text',
    callStartedAt: 'ts', callEndedAt: 'ts', callDelayMinutes: 'int', callMethod: 'text', outcome: 'text',
    cancelledAt: 'ts', cancelReason: 'text', remindersSent: 'int[]',
    createdById: 'text', createdAt: 'ts', updatedAt: 'ts',
  }, { defaults: { status: 'SCHEDULED', source: 'CLIENT_LINK', rescheduleCount: 0, remindersSent: [] } }),

  documents: t('Documents', {
    id: 'text', appointmentId: 'text', clientId: 'text', bookingLinkId: 'text', uploadSession: 'text',
    fileName: 'text', fileType: 'text', size: 'int', fileId: 'text', uploadedBy: 'text', createdAt: 'ts',
  }, { updatedAt: false }),

  consultationNotes: t('ConsultationNotes', {
    id: 'text', appointmentId: 'text', doctorId: 'text', mainIssue: 'text', assessment: 'text',
    recommendation: 'text', furtherTests: 'text', prescriptionNotes: 'text', ivRecommendation: 'text',
    followUp: 'text', followUpAt: 'ts', additionalNotes: 'text', createdAt: 'ts', updatedAt: 'ts',
  }),

  upsells: t('Upsells', {
    id: 'text', appointmentId: 'text', service: 'text', status: 'text', recommendedAmount: 'num',
    bookedAmount: 'num', bookingReference: 'text', createdById: 'text', createdAt: 'ts', updatedAt: 'ts',
  }, { defaults: { status: 'RECOMMENDED', recommendedAmount: 0 } }),

  emailTemplates: t('EmailTemplates', {
    id: 'text', type: 'text', subject: 'text', body: 'text', enabled: 'bool', updatedBy: 'text', updatedAt: 'ts',
  }, { defaults: { enabled: true }, createdAt: false }),

  // Human-editable: key | value (JSON: 5, true, "text", [...]) | updatedBy | updatedAt
  settings: t('Settings', {
    key: 'text', value: 'json', updatedBy: 'text', updatedAt: 'ts',
  }, { idColumn: 'key', createdAt: false }),

  storedFiles: t('Files', {
    id: 'text', driver: 'text', storageKey: 'text', mimeType: 'text', size: 'int', createdAt: 'ts',
  }, { updatedAt: false }),

  // Append-mostly logs — loaded only by the pages that show them.
  auditLogs: t('AuditLog', {
    id: 'text', createdAt: 'ts', actorType: 'text', actorEmail: 'text', action: 'text', summary: 'text',
    appointmentId: 'text', entityType: 'text', entityId: 'text', actorId: 'text',
    oldValue: 'json', newValue: 'json', reason: 'text', ip: 'text',
  }, { updatedAt: false }),

  emailLogs: t('EmailLog', {
    id: 'text', createdAt: 'ts', type: 'text', status: 'text', recipient: 'text', recipientName: 'text',
    subject: 'text', appointmentId: 'text', provider: 'text', providerMessageId: 'text', error: 'text',
    attempts: 'int', sentAt: 'ts', deliveredAt: 'ts', html: 'text', text: 'text',
  }, { defaults: { status: 'PENDING', attempts: 0 }, updatedAt: false }),
};

// Raw chunk storage for STORAGE_DRIVER=sheet (never part of table reads).
export const FILE_DATA_TAB = 'FileData';
export const FILE_DATA_HEADERS = ['fileId', 'part', 'data'];

export const tableNames = Object.keys(TABLES);
export const idColumn = (table) => TABLES[table].idColumn || 'id';
export const headersOf = (table) => Object.keys(TABLES[table].columns);
