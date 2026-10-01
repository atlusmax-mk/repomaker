'use strict';

const Alexa = require('ask-sdk-core');
const cinema = require('./lib/cinemaService');
const dates = require('./lib/dates');
const { escapeSsml, list, hours, rating, duration } = require('./lib/speech');

// Voz alternativa con la que se "locuta" la reseña cuando no hay audio grabado.
const REVIEW_VOICE = process.env.REVIEW_VOICE || 'Enrique';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function slotValue(handlerInput, name) {
  return Alexa.getSlotValue(handlerInput.requestEnvelope, name) || null;
}

function resolvedSlotId(handlerInput, name) {
  const slot = Alexa.getSlot(handlerInput.requestEnvelope, name);
  const authorities = slot && slot.resolutions && slot.resolutions.resolutionsPerAuthority;
  const match = (authorities || []).find((a) => a.status && a.status.code === 'ER_SUCCESS_MATCH');
  return match ? match.values[0].value.id : null;
}

function sessionAttrs(handlerInput) {
  return handlerInput.attributesManager.getSessionAttributes();
}

function supportsAudioPlayer(handlerInput) {
  const interfaces = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope) || {};
  return Boolean(interfaces.AudioPlayer);
}

function isAudioRequest(handlerInput) {
  const type = Alexa.getRequestType(handlerInput.requestEnvelope);
  return type.startsWith('AudioPlayer.') || type.startsWith('PlaybackController.');
}

function isIntent(handlerInput, ...names) {
  return (
    Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
    names.includes(Alexa.getIntentName(handlerInput.requestEnvelope))
  );
}

/**
 * Obtiene la película pedida en el slot "pelicula" o, si no se ha dicho,
 * la última de la que se habló en la sesión.
 * Devuelve { movie, spoken } donde spoken es lo que dijo el usuario.
 */
async function movieFromRequest(handlerInput) {
  const spoken = slotValue(handlerInput, 'pelicula');
  const id = resolvedSlotId(handlerInput, 'pelicula');
  if (spoken || id) {
    return { movie: await cinema.findMovie({ id, name: spoken }), spoken };
  }
  const lastId = sessionAttrs(handlerInput).lastMovieId;
  return { movie: lastId ? await cinema.getMovieById(lastId) : null, spoken: null };
}

function rememberMovie(handlerInput, movie) {
  sessionAttrs(handlerInput).lastMovieId = movie.id;
}

async function dateFromRequest(handlerInput) {
  const { zonaHoraria } = await cinema.getCinema();
  const iso = dates.resolveDate(slotValue(handlerInput, 'fecha'), zonaHoraria);
  return { iso, label: iso && dates.describeDate(iso, zonaHoraria), zonaHoraria };
}

async function notFoundResponse(handlerInput, spoken) {
  const titles = (await cinema.getMovies()).map((m) => escapeSsml(m.titulo));
  const what = spoken ? `"${escapeSsml(spoken)}"` : 'esa película';
  return handlerInput.responseBuilder
    .speak(`No encuentro ${what} en nuestra cartelera. Tenemos ${list(titles)}. ¿Cuál te interesa?`)
    .reprompt('¿De qué película quieres saber algo?')
    .getResponse();
}

function askForMovie(handlerInput, question) {
  return handlerInput.responseBuilder
    .speak(question)
    .reprompt('¿Qué película?')
    .addElicitSlotDirective('pelicula')
    .getResponse();
}

const UNSUPPORTED_DATE =
  'Solo puedo consultar días concretos, como hoy, mañana o el sábado. ¿Qué día quieres?';

// ---------------------------------------------------------------------------
// Handlers de conversación
// ---------------------------------------------------------------------------

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const { nombre } = await cinema.getCinema();
    return handlerInput.responseBuilder
      .speak(
        `Bienvenido a ${escapeSsml(nombre)}. Puedes preguntarme qué películas hay hoy, ` +
          'los horarios de una película, sus detalles o pedirme que te ponga su reseña. ¿Qué te apetece?'
      )
      .reprompt('Por ejemplo, di: ¿qué películas hay hoy?')
      .getResponse();
  },
};

const CarteleraIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'CarteleraIntent');
  },
  async handle(handlerInput) {
    const { iso, label } = await dateFromRequest(handlerInput);
    if (!iso) {
      return handlerInput.responseBuilder.speak(UNSUPPORTED_DATE).reprompt(UNSUPPORTED_DATE).getResponse();
    }
    const movies = await cinema.moviesOn(dates.weekdayOf(iso));
    if (!movies.length) {
      return handlerInput.responseBuilder
        .speak(`${capitalize(label)} no hay sesiones programadas. ¿Quieres consultar otro día?`)
        .reprompt('¿Qué día quieres consultar?')
        .getResponse();
    }
    const titles = movies.map((m) => escapeSsml(m.titulo));
    return handlerInput.responseBuilder
      .speak(
        `${capitalize(label)} proyectamos ${movies.length} películas: ${list(titles)}. ` +
          '¿De cuál quieres los horarios o los detalles?'
      )
      .reprompt('Puedes pedirme los horarios, los detalles o la reseña de cualquiera de ellas.')
      .withSimpleCard('Cartelera', movies.map((m) => `• ${m.titulo} (${m.genero})`).join('\n'))
      .getResponse();
  },
};

const HorariosIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'HorariosIntent');
  },
  async handle(handlerInput) {
    const { movie, spoken } = await movieFromRequest(handlerInput);
    if (!movie && !spoken) return askForMovie(handlerInput, '¿De qué película quieres los horarios?');
    if (!movie) return notFoundResponse(handlerInput, spoken);
    rememberMovie(handlerInput, movie);

    const { iso, label } = await dateFromRequest(handlerInput);
    if (!iso) {
      return handlerInput.responseBuilder.speak(UNSUPPORTED_DATE).reprompt(UNSUPPORTED_DATE).getResponse();
    }
    const weekday = dates.weekdayOf(iso);
    const sessions = cinema.sessionsOn(movie, weekday);
    const title = escapeSsml(movie.titulo);

    if (!sessions.length) {
      const nextDays = [1, 2, 3, 4, 5, 6]
        .map((n) => dates.addDays(iso, n))
        .filter((d) => cinema.sessionsOn(movie, dates.weekdayOf(d)).length);
      const hint = nextDays.length
        ? ` La próxima sesión es el ${dates.DAY_NAMES[dates.weekdayOf(nextDays[0])]}.`
        : '';
      return handlerInput.responseBuilder
        .speak(`${capitalize(label)} no hay sesiones de ${title}.${hint} ¿Te ayudo con algo más?`)
        .reprompt('¿Quieres consultar otra película u otro día?')
        .getResponse();
    }

    const parts = sessions.map((s) => `en la ${escapeSsml(s.sala)} ${hours(s.horas)}`);
    return handlerInput.responseBuilder
      .speak(
        `${capitalize(label)} puedes ver ${title} ${list(parts)}. ` +
          '¿Quieres saber de qué trata o escuchar su reseña?'
      )
      .reprompt('Di "detalles" o "reseña", o pregunta por otra película.')
      .withSimpleCard(
        `${movie.titulo} · ${label}`,
        sessions.map((s) => `${s.sala}: ${s.horas.join(' · ')}`).join('\n')
      )
      .getResponse();
  },
};

const DetallesPeliculaIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'DetallesPeliculaIntent');
  },
  async handle(handlerInput) {
    const { movie, spoken } = await movieFromRequest(handlerInput);
    if (!movie && !spoken) return askForMovie(handlerInput, '¿De qué película quieres saber más?');
    if (!movie) return notFoundResponse(handlerInput, spoken);
    rememberMovie(handlerInput, movie);

    const speech =
      `${escapeSsml(movie.titulo)} es una película de ${escapeSsml(movie.genero)} ` +
      `dirigida por ${escapeSsml(movie.director)}, con ${list(movie.reparto.map(escapeSsml))}. ` +
      `${escapeSsml(movie.sinopsis)} ` +
      `Dura ${duration(movie.duracionMin)} y nuestra valoración es de ${rating(movie.valoracion)}. ` +
      `Clasificación: ${escapeSsml(lowerFirst(movie.clasificacion))}. ` +
      '¿Quieres los horarios o escuchar la reseña?';

    return handlerInput.responseBuilder
      .speak(speech)
      .reprompt('Di "horarios" o "reseña".')
      .withSimpleCard(
        movie.titulo,
        `${movie.genero} · ${movie.duracionMin} min · ${movie.clasificacion}\n` +
          `Dirección: ${movie.director}\nReparto: ${movie.reparto.join(', ')}\n\n` +
          `${movie.sinopsis}\n\nValoración: ${movie.valoracion}/5`
      )
      .getResponse();
  },
};

const ResenaPeliculaIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'ResenaPeliculaIntent');
  },
  async handle(handlerInput) {
    const { movie, spoken } = await movieFromRequest(handlerInput);
    if (!movie && !spoken) return askForMovie(handlerInput, '¿De qué película quieres escuchar la reseña?');
    if (!movie) return notFoundResponse(handlerInput, spoken);
    rememberMovie(handlerInput, movie);
    const title = escapeSsml(movie.titulo);

    // Reseña grabada: se reproduce con AudioPlayer (admite pausa y reanudar).
    if (movie.resenaAudioUrl && supportsAudioPlayer(handlerInput)) {
      return handlerInput.responseBuilder
        .speak(`Aquí tienes la reseña de ${title}.`)
        .addAudioPlayerPlayDirective('REPLACE_ALL', movie.resenaAudioUrl, movie.id, 0, null, {
          title: `Reseña: ${movie.titulo}`,
          subtitle: 'Mi Cine',
        })
        .withShouldEndSession(true)
        .getResponse();
    }

    // Sin audio grabado: la reseña se locuta con una voz de "crítico".
    return handlerInput.responseBuilder
      .speak(
        `Esta es nuestra reseña de ${title}. <break time="400ms"/>` +
          `<voice name="${REVIEW_VOICE}">${escapeSsml(movie.resena)} ` +
          `Nota: ${rating(movie.valoracion)}.</voice><break time="400ms"/>` +
          '¿Quieres los horarios de esta película?'
      )
      .reprompt('¿Te digo los horarios?')
      .withSimpleCard(`Reseña: ${movie.titulo}`, `${movie.resena}\n\nNota: ${movie.valoracion}/5`)
      .getResponse();
  },
};

/** "Sí" tras ofrecer horarios/detalles: por defecto damos los horarios. */
const YesIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'AMAZON.YesIntent');
  },
  async handle(handlerInput) {
    if (sessionAttrs(handlerInput).lastMovieId) return HorariosIntentHandler.handle(handlerInput);
    return CarteleraIntentHandler.handle(handlerInput);
  },
};

const NoIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'AMAZON.NoIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('De acuerdo. ¡Disfruta del cine!').withShouldEndSession(true).getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'AMAZON.HelpIntent');
  },
  handle(handlerInput) {
    const speech =
      'Puedo decirte la cartelera de hoy o de otro día, los horarios de una película, ' +
      'sus detalles como la sinopsis o el reparto, y ponerte su reseña. ' +
      'Prueba a decir: horarios de Galaxia rota mañana. ¿Qué quieres hacer?';
    return handlerInput.responseBuilder.speak(speech).reprompt('¿Qué quieres hacer?').getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'AMAZON.FallbackIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Eso no lo sé hacer. Puedo darte la cartelera, horarios, detalles y reseñas. ¿Qué necesitas?')
      .reprompt('¿Qué necesitas?')
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent');
  },
  handle(handlerInput) {
    const builder = handlerInput.responseBuilder.speak('¡Hasta pronto, nos vemos en el cine!');
    if (supportsAudioPlayer(handlerInput)) builder.addAudioPlayerStopDirective();
    return builder.withShouldEndSession(true).getResponse();
  },
};

// ---------------------------------------------------------------------------
// Control de la reproducción de reseñas en audio
// ---------------------------------------------------------------------------

function audioContext(handlerInput) {
  return handlerInput.requestEnvelope.context.AudioPlayer || {};
}

async function playFromContext(handlerInput, fromStart) {
  const { token, offsetInMilliseconds } = audioContext(handlerInput);
  const movie = token && (await cinema.getMovieById(token));
  if (!movie || !movie.resenaAudioUrl) {
    return handlerInput.responseBuilder.speak('No hay ninguna reseña para reanudar.').getResponse();
  }
  return handlerInput.responseBuilder
    .addAudioPlayerPlayDirective(
      'REPLACE_ALL',
      movie.resenaAudioUrl,
      movie.id,
      fromStart ? 0 : offsetInMilliseconds || 0,
      null,
      { title: `Reseña: ${movie.titulo}`, subtitle: 'Mi Cine' }
    )
    .getResponse();
}

const PauseHandler = {
  canHandle(handlerInput) {
    return (
      isIntent(handlerInput, 'AMAZON.PauseIntent') ||
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'PlaybackController.PauseCommandIssued'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.addAudioPlayerStopDirective().getResponse();
  },
};

const ResumeHandler = {
  canHandle(handlerInput) {
    return (
      isIntent(handlerInput, 'AMAZON.ResumeIntent') ||
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'PlaybackController.PlayCommandIssued'
    );
  },
  handle(handlerInput) {
    return playFromContext(handlerInput, false);
  },
};

const StartOverHandler = {
  canHandle(handlerInput) {
    return isIntent(handlerInput, 'AMAZON.StartOverIntent');
  },
  handle(handlerInput) {
    return playFromContext(handlerInput, true);
  },
};

const UnsupportedAudioIntentHandler = {
  canHandle(handlerInput) {
    return (
      isIntent(
        handlerInput,
        'AMAZON.NextIntent',
        'AMAZON.PreviousIntent',
        'AMAZON.LoopOnIntent',
        'AMAZON.LoopOffIntent',
        'AMAZON.ShuffleOnIntent',
        'AMAZON.ShuffleOffIntent',
        'AMAZON.RepeatIntent'
      ) ||
      ['PlaybackController.NextCommandIssued', 'PlaybackController.PreviousCommandIssued'].includes(
        Alexa.getRequestType(handlerInput.requestEnvelope)
      )
    );
  },
  handle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope).startsWith('PlaybackController.')) {
      return handlerInput.responseBuilder.getResponse();
    }
    return handlerInput.responseBuilder
      .speak('Eso no está disponible para las reseñas. Puedes pausar, reanudar o volver a empezar.')
      .getResponse();
  },
};

/** Eventos de AudioPlayer: solo se registran; no admiten voz en la respuesta. */
const AudioPlayerEventHandler = {
  canHandle(handlerInput) {
    return isAudioRequest(handlerInput);
  },
  handle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    if (request.type === 'AudioPlayer.PlaybackFailed') {
      console.error('Fallo al reproducir la reseña:', JSON.stringify(request.error));
    }
    return handlerInput.responseBuilder.getResponse();
  },
};

// ---------------------------------------------------------------------------
// Sistema
// ---------------------------------------------------------------------------

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    const { reason, error } = handlerInput.requestEnvelope.request;
    if (error) console.error('Sesión terminada con error:', reason, JSON.stringify(error));
    return handlerInput.responseBuilder.getResponse();
  },
};

const SystemExceptionHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'System.ExceptionEncountered';
  },
  handle(handlerInput) {
    console.error('System.ExceptionEncountered:', JSON.stringify(handlerInput.requestEnvelope.request.error));
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Error:', error.stack || error.message);
    if (isAudioRequest(handlerInput)) return handlerInput.responseBuilder.getResponse();
    return handlerInput.responseBuilder
      .speak('Lo siento, ha habido un problema. ¿Puedes repetirlo?')
      .reprompt('¿Puedes repetirlo?')
      .getResponse();
  },
};

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    CarteleraIntentHandler,
    HorariosIntentHandler,
    DetallesPeliculaIntentHandler,
    ResenaPeliculaIntentHandler,
    YesIntentHandler,
    NoIntentHandler,
    PauseHandler,
    ResumeHandler,
    StartOverHandler,
    UnsupportedAudioIntentHandler,
    AudioPlayerEventHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    SystemExceptionHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent('mi-cine/v1')
  .lambda();
