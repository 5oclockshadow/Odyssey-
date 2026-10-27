// Input rules shared by the deployed server and the in-page demo. Pure functions, no I/O.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const INTERESTS = ['thoughts', 'atlas', 'both'];
export const ROLES = ['researcher', 'founder', 'legal', 'educator', 'writer', 'archivist', 'product', 'other'];
export const EVENT_TYPES = ['page_view', 'cta_click', 'signup_start', 'signup_complete', 'survey_complete', 'upgrade_intent', 'contact_submit', 'share'];
export const TOPICS = ['general', 'press', 'partnership', 'support', 'security'];
export const clean = (s, n = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const out = (errors, value) => ({ ok: Object.keys(errors).length === 0, errors, value });

export function validateWaitlist(b = {}) {
  const e = {}, email = clean(b.email, 254).toLowerCase();
  if (!EMAIL.test(email)) e.email = 'Enter a valid email address.';
  const interest = INTERESTS.includes(b.interest) ? b.interest : 'both', role = ROLES.includes(b.role) ? b.role : 'other';
  return out(e, { email, name: clean(b.name, 80), role, interest, useCase: clean(b.useCase, 500), ref: clean(b.ref, 12).toUpperCase(), source: clean(b.source, 60) });
}
export function validateSurvey(b = {}) {
  const e = {}, domains = (Array.isArray(b.domains) ? b.domains : []).map(d => clean(d, 40)).filter(Boolean).slice(0, 10);
  if (!clean(b.useCase, 500) && !domains.length) e.useCase = 'Tell us what you want to map, or pick a field.';
  return out(e, { useCase: clean(b.useCase, 500), teamSize: ['solo', '2-5', '6-20', '21+'].includes(b.teamSize) ? b.teamSize : 'solo', domains });
}
export function validateContact(b = {}) {
  const e = {}, email = clean(b.email, 254).toLowerCase(), message = clean(b.message, 4000), name = clean(b.name, 80);
  if (!name) e.name = 'Add your name.'; if (!EMAIL.test(email)) e.email = 'Enter a valid email address.'; if (message.length < 10) e.message = 'Write at least a sentence.';
  return out(e, { name, email, message, topic: TOPICS.includes(b.topic) ? b.topic : 'general' });
}
export function validateEvent(b = {}) {
  const e = {}; if (!EVENT_TYPES.includes(b.type)) e.type = 'Unknown event type.';
  const props = {}; if (b.props && typeof b.props === 'object') for (const k of Object.keys(b.props).slice(0, 8)) props[clean(k, 30)] = clean(b.props[k], 80);
  return out(e, { type: b.type, page: clean(b.page, 80), session: clean(b.session, 40), props });
}
export function validateUpgrade(b = {}) {
  const e = {}, code = clean(b.code, 12).toUpperCase(); if (!/^[A-Z2-7]{8}$/.test(code)) e.code = 'Missing or malformed member code.';
  return out(e, { code, plan: ['founding'].includes(b.plan) ? b.plan : 'founding', note: clean(b.note, 300) });
}
