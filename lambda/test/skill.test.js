'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { envelope, intentRequest, invoke, speech } = require('./helpers');
const data = require('../data/peliculas.json');
const cinema = require('../lib/cinemaService');
const dates = require('../lib/dates');

const LUNES = '2026-09-28';
const SABADO = '2026-10-03';

test('LaunchRequest da la bienvenida y deja la sesión abierta', async () => {
  const res = await invoke(envelope({ type: 'LaunchRequest' }));
  assert.match(speech(res), /Bienvenido a Mi Cine/);
  assert.equal(res.response.shouldEndSession, false);
});

test('Cartelera lista las películas con sesión ese día', async () => {
  const res = await invoke(intentRequest('CarteleraIntent', { fecha: LUNES }));
  const ssml = speech(res);
  assert.match(ssml, /Galaxia rota/);
  assert.match(ssml, /Pequeños héroes/);
  assert.doesNotMatch(ssml, /La sombra del río/); // solo de miércoles a sábado
});

test('Cartelera rechaza fechas que no son un día concreto', async () => {
  const res = await invoke(intentRequest('CarteleraIntent', { fecha: '2026-W40' }));
  assert.match(speech(res), /días concretos/);
});

test('Horarios por id resuelto y fecha, y recuerda la película', async () => {
  const res = await invoke(
    intentRequest('HorariosIntent', { pelicula: { value: 'galaxia', id: 'galaxia_rota' }, fecha: SABADO })
  );
  const ssml = speech(res);
  assert.match(ssml, /Sala 3/);
  assert.match(ssml, /las 16:00, las 19:15 y las 22:30/);
  assert.equal(res.sessionAttributes.lastMovieId, 'galaxia_rota');
});

test('Horarios sin película usa la última de la sesión', async () => {
  const res = await invoke(
    intentRequest('HorariosIntent', { fecha: LUNES }, { attributes: { lastMovieId: 'el_ultimo_faro' } })
  );
  assert.match(speech(res), /El último faro/);
});

test('Horarios sin película ni contexto pide la película', async () => {
  const res = await invoke(intentRequest('HorariosIntent', {}));
  assert.equal(res.response.directives[0].type, 'Dialog.ElicitSlot');
  assert.equal(res.response.directives[0].slotToElicit, 'pelicula');
});

test('Horarios de un día sin sesiones sugiere el siguiente', async () => {
  const res = await invoke(intentRequest('HorariosIntent', { pelicula: { value: 'la sombra del río', id: 'la_sombra_del_rio' }, fecha: LUNES }));
  assert.match(speech(res), /no hay sesiones de La sombra del río/);
  assert.match(speech(res), /miércoles/);
});

test('Película desconocida', async () => {
  const res = await invoke(intentRequest('DetallesPeliculaIntent', { pelicula: 'Titanic' }));
  assert.match(speech(res), /No encuentro "Titanic"/);
});

test('Detalles por nombre sin resolución (búsqueda aproximada, sin tildes)', async () => {
  const res = await invoke(intentRequest('DetallesPeliculaIntent', { pelicula: 'pequenos heroes' }));
  const ssml = speech(res);
  assert.match(ssml, /Pequeños héroes es una película de animación/);
  assert.match(ssml, /una hora y 28 minutos/);
  assert.match(ssml, /3 coma 5 sobre 5/);
});

test('Reseña sin audio grabado se locuta con otra voz', async () => {
  const res = await invoke(intentRequest('ResenaPeliculaIntent', { pelicula: { value: 'el faro', id: 'el_ultimo_faro' } }));
  assert.match(speech(res), /<voice name="Enrique">Una película serena/);
  assert.equal(res.response.directives, undefined);
});

test('Reseña con audio grabado usa AudioPlayer.Play', async (t) => {
  const movie = data.peliculas[0];
  movie.resenaAudioUrl = 'https://example.com/resena.mp3';
  t.after(() => (movie.resenaAudioUrl = null));
  const res = await invoke(intentRequest('ResenaPeliculaIntent', { pelicula: { value: movie.titulo, id: movie.id } }));
  const play = res.response.directives[0];
  assert.equal(play.type, 'AudioPlayer.Play');
  assert.equal(play.audioItem.stream.url, 'https://example.com/resena.mp3');
  assert.equal(play.audioItem.stream.token, movie.id);
  assert.equal(res.response.shouldEndSession, true);
});

test('Reseña con audio en dispositivo sin AudioPlayer cae a voz', async (t) => {
  const movie = data.peliculas[0];
  movie.resenaAudioUrl = 'https://example.com/resena.mp3';
  t.after(() => (movie.resenaAudioUrl = null));
  const res = await invoke(
    intentRequest('ResenaPeliculaIntent', { pelicula: { value: movie.titulo, id: movie.id } }, { audioPlayer: false })
  );
  assert.match(speech(res), /<voice/);
});

test('Resume reanuda desde el offset del contexto', async (t) => {
  const movie = data.peliculas[1];
  movie.resenaAudioUrl = 'https://example.com/r2.mp3';
  t.after(() => (movie.resenaAudioUrl = null));
  const res = await invoke(
    intentRequest('AMAZON.ResumeIntent', {}, { audioContext: { token: movie.id, offsetInMilliseconds: 4200, playerActivity: 'STOPPED' } })
  );
  assert.equal(res.response.directives[0].audioItem.stream.offsetInMilliseconds, 4200);
});

test('Pause detiene el audio', async () => {
  const res = await invoke(intentRequest('AMAZON.PauseIntent'));
  assert.equal(res.response.directives[0].type, 'AudioPlayer.Stop');
});

test('Eventos de AudioPlayer responden vacío', async () => {
  for (const type of ['AudioPlayer.PlaybackStarted', 'AudioPlayer.PlaybackNearlyFinished', 'AudioPlayer.PlaybackFinished']) {
    const res = await invoke(envelope({ type, token: 'x', offsetInMilliseconds: 0 }));
    assert.equal(res.response.outputSpeech, undefined, type);
  }
});

test('Sí tras hablar de una película da sus horarios', async () => {
  const res = await invoke(intentRequest('AMAZON.YesIntent', {}, { attributes: { lastMovieId: 'risas_en_familia' } }));
  assert.match(speech(res), /Risas en familia/);
});

test('Stop cierra la sesión', async () => {
  const res = await invoke(intentRequest('AMAZON.StopIntent'));
  assert.equal(res.response.shouldEndSession, true);
});

test('Los títulos con caracteres especiales se escapan en SSML', async (t) => {
  const movie = data.peliculas[2];
  const original = movie.titulo;
  movie.titulo = 'Tom & Jerry';
  t.after(() => (movie.titulo = original));
  const res = await invoke(intentRequest('DetallesPeliculaIntent', { pelicula: { value: 'x', id: movie.id } }));
  assert.match(speech(res), /Tom &amp; Jerry/);
});

test('describeDate', () => {
  const now = new Date('2026-09-25T10:00:00Z'); // viernes
  const tz = 'Europe/Madrid';
  assert.equal(dates.describeDate('2026-09-25', tz, now), 'hoy');
  assert.equal(dates.describeDate('2026-09-26', tz, now), 'mañana');
  assert.equal(dates.describeDate('2026-09-28', tz, now), 'el lunes');
  assert.equal(dates.describeDate('2026-10-12', tz, now), 'el 12 de octubre');
  assert.equal(dates.resolveDate(undefined, tz, new Date('2026-09-25T23:30:00Z')), '2026-09-26');
});

test('CINE_API_URL carga datos remotos y cae a locales si falla', async (t) => {
  const remote = { cine: { nombre: 'Cine Remoto', zonaHoraria: 'Europe/Madrid' }, peliculas: [] };
  process.env.CINE_API_URL = 'https://cine.example.com/api/';
  const originalFetch = global.fetch;
  t.after(() => {
    delete process.env.CINE_API_URL;
    global.fetch = originalFetch;
    cinema._resetCache();
  });
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = url;
    return { ok: true, json: async () => remote };
  };
  assert.equal((await cinema.getCinema()).nombre, 'Cine Remoto');
  assert.equal(calledUrl, 'https://cine.example.com/api/peliculas');

  cinema._resetCache();
  global.fetch = async () => ({ ok: false, status: 500 });
  assert.equal((await cinema.getCinema()).nombre, 'Mi Cine');
});

test('El slot PELICULA del modelo está sincronizado con los datos', () => {
  const model = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../skill-package/interactionModels/custom/es-ES.json'), 'utf8')
  );
  const type = model.interactionModel.languageModel.types.find((t) => t.name === 'PELICULA');
  assert.deepEqual(
    type.values.map((v) => v.id),
    data.peliculas.map((p) => p.id),
    'Ejecuta: node scripts/generar-modelo.js'
  );
});
