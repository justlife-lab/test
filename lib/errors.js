// Typed application errors with client-safe messages.
// Route handlers convert these to JSON responses (see lib/api.js).

export const MESSAGES = {
  SLOT_TAKEN: 'Sorry, this time slot has just been booked by another client. Please select another available time.',
  DOCTOR_UNAVAILABLE: 'This doctor is currently unavailable. Please choose another doctor.',
  NOT_AVAILABLE_AT_TIME: 'This doctor is not available during the selected time.',
  UPLOAD_FAILED: "We couldn't upload your file. Please check the file type and size and try again.",
  LINK_INVALID: 'This booking link is not valid. Please contact Justlife Healthcare for a new link.',
  LINK_EXPIRED: 'This booking link has expired. Please contact Justlife Healthcare for a new link.',
  LINK_USED: 'This booking link has already been used. Please contact Justlife Healthcare if you need another appointment.',
  LINK_CANCELLED: 'This booking link is no longer active. Please contact Justlife Healthcare for assistance.',
  RESCHEDULE_CLOSED: 'This appointment can no longer be rescheduled online. Please contact Justlife Healthcare for assistance.',
  RESCHEDULE_INVALID: 'This reschedule link is not valid or the appointment is no longer active.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  UNAUTHORIZED: 'Please sign in to continue.',
  NOT_FOUND: 'Not found.',
  ADMIN_DOMAIN: 'Access restricted to authorized Justlife accounts.',
};

export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message || MESSAGES[code] || code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError('BAD_REQUEST', message, 400, details);
export const notFound = (message = MESSAGES.NOT_FOUND) => new AppError('NOT_FOUND', message, 404);
export const forbidden = () => new AppError('FORBIDDEN', MESSAGES.FORBIDDEN, 403);
export const unauthorized = () => new AppError('UNAUTHORIZED', MESSAGES.UNAUTHORIZED, 401);
export const conflict = (code, message) => new AppError(code, message, 409);
