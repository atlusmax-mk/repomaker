'use strict';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del cine. */
function todayIso(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/**
 * Convierte el valor de AMAZON.DATE en un día concreto (YYYY-MM-DD).
 * Solo admite días concretos; para semanas, meses, etc. devuelve null.
 * Sin valor, devuelve hoy.
 */
function resolveDate(slotValue, timeZone, now = new Date()) {
  const today = todayIso(timeZone, now);
  if (!slotValue) return today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(slotValue)) return slotValue;
  return null;
}

/** "hoy", "mañana", "el viernes" o "el 3 de octubre". */
function describeDate(iso, timeZone, now = new Date()) {
  const today = todayIso(timeZone, now);
  if (iso === today) return 'hoy';
  if (iso === addDays(today, 1)) return 'mañana';
  const diff = (new Date(`${iso}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000;
  if (diff > 1 && diff < 7) return `el ${DAY_NAMES[weekdayOf(iso)]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(d);
  return `el ${d.getUTCDate()} de ${month}`;
}

module.exports = { todayIso, addDays, weekdayOf, resolveDate, describeDate, DAY_NAMES };
