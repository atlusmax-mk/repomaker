'use strict';

/**
 * Acceso a los datos del cine.
 *
 * Por defecto usa data/peliculas.json. Si se define la variable de entorno
 * CINE_API_URL, descarga los datos de `${CINE_API_URL}/peliculas`, que debe
 * devolver el mismo formato JSON ({ cine, peliculas }). Así la skill puede
 * apuntar a la API de la web de Cine sin cambiar el resto del código.
 */

const localData = require('../data/peliculas.json');

const CACHE_MS = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

async function loadData() {
  const apiUrl = process.env.CINE_API_URL;
  if (!apiUrl) return localData;

  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/peliculas`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = await res.json();
    cacheAt = Date.now();
    return cache;
  } catch (err) {
    console.error('No se pudo cargar CINE_API_URL, uso datos locales:', err.message);
    return cache || localData;
  }
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getCinema() {
  return (await loadData()).cine;
}

async function getMovies() {
  return (await loadData()).peliculas;
}

async function getMovieById(id) {
  return (await getMovies()).find((m) => m.id === id) || null;
}

/** Busca por id de slot resuelto o, si no, por título/sinónimo aproximado. */
async function findMovie({ id, name }) {
  const movies = await getMovies();
  if (id) {
    const byId = movies.find((m) => m.id === id);
    if (byId) return byId;
  }
  const query = normalize(name);
  if (!query) return null;
  const candidates = (m) => [m.titulo, ...(m.sinonimos || [])].map(normalize);
  return (
    movies.find((m) => candidates(m).includes(query)) ||
    movies.find((m) => candidates(m).some((c) => c.includes(query) || query.includes(c))) ||
    null
  );
}

function sessionsOn(movie, weekday) {
  return (movie.sesiones || []).filter((s) => s.dias.includes(weekday));
}

function hoursOn(movie, weekday) {
  return sessionsOn(movie, weekday)
    .flatMap((s) => s.horas)
    .sort();
}

async function moviesOn(weekday) {
  return (await getMovies()).filter((m) => sessionsOn(m, weekday).length > 0);
}

module.exports = {
  getCinema,
  getMovies,
  getMovieById,
  findMovie,
  sessionsOn,
  hoursOn,
  moviesOn,
  normalize,
  _resetCache: () => {
    cache = null;
    cacheAt = 0;
  },
};
