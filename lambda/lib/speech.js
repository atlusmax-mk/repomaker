'use strict';

function escapeSsml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** "a, b y c" */
function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function hour(h) {
  return `las ${h}`;
}

function hours(hs) {
  if (hs.length === 1) return `a ${hour(hs[0])}`;
  return `a ${list(hs.map(hour))}`;
}

function rating(value) {
  const n = Number(value);
  const txt = Number.isInteger(n) ? String(n) : String(n).replace('.', ' coma ');
  return `${txt} sobre 5`;
}

function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hTxt = h === 1 ? 'una hora' : `${h} horas`;
  if (!h) return `${m} minutos`;
  return m ? `${hTxt} y ${m} minutos` : hTxt;
}

module.exports = { escapeSsml, list, hours, rating, duration };
