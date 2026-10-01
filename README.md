# Mi Cine: skill de Alexa

Skill de Alexa (es-ES) para la web de Cine. Con ella puedes preguntar:

| Función | Ejemplos |
|---|---|
| **Cartelera** | «Alexa, pregunta a mi cine qué películas hay hoy», «¿qué echan el sábado?» |
| **Horarios** | «horarios de Galaxia rota mañana», «¿a qué hora ponen El último faro?» |
| **Detalles** | «¿de qué va La sombra del río?», «¿quién sale en Pequeños héroes?» |
| **Reseña en audio** | «ponme la reseña de Risas en familia», «pausa», «reanuda», «empieza de nuevo» |

La skill recuerda la última película de la que se ha hablado. Por ejemplo, después de pedir los detalles de una película basta con decir «¿y los horarios?» o «sí».

## Reseñas en audio

Cada película de `lambda/data/peliculas.json` tiene el campo `resenaAudioUrl`:

- **Con una URL HTTPS a un MP3/AAC**: la reseña se reproduce con la interfaz `AudioPlayer`. Admite pausa, reanudar y empezar de nuevo, y se ve en la pantalla de los Echo Show o en la app de Alexa.
- **Con `null`**: la skill lee el texto de `resena` con otra voz de Polly («Enrique» por defecto; se cambia con la variable de entorno `REVIEW_VOICE`), para que suene como un crítico.

## Estructura

```
ask-resources.json                          Configuración de ASK CLI (despliegue a Lambda)
skill-package/skill.json                    Manifiesto (nombre, frases de ejemplo, AUDIO_PLAYER)
skill-package/interactionModels/custom/es-ES.json   Modelo de voz: intents, frases y slots
lambda/index.js                             Handlers de la skill
lambda/lib/cinemaService.js                 Acceso a los datos (JSON local o API de la web)
lambda/lib/dates.js, lib/speech.js          Fechas (zona horaria del cine) y textos hablados
lambda/data/peliculas.json                  Cartelera de ejemplo
lambda/test/                                Tests (node --test)
scripts/generar-modelo.js                   Sincroniza el slot PELICULA con los datos
```

## Conectarla a la web de Cine

Hay dos opciones:

1. **Datos estáticos**: edita `lambda/data/peliculas.json` y ejecuta `node scripts/generar-modelo.js` para que Alexa reconozca los títulos nuevos. Después, vuelve a desplegar.
2. **API de la web**: define la variable de entorno `CINE_API_URL` en la Lambda (por ejemplo, `https://mi-cine.com/api`). La skill hará `GET {CINE_API_URL}/peliculas`, guardará la respuesta 5 minutos en caché y, si la API falla, usará los datos locales. La respuesta debe tener el mismo formato que `peliculas.json`:

```json
{
  "cine": { "nombre": "Mi Cine", "zonaHoraria": "Europe/Madrid" },
  "peliculas": [{
    "id": "galaxia_rota", "titulo": "Galaxia rota", "sinonimos": ["galaxia"],
    "genero": "ciencia ficción", "duracionMin": 142, "clasificacion": "No recomendada para menores de 12 años",
    "director": "…", "reparto": ["…"], "sinopsis": "…", "valoracion": 4,
    "resena": "…", "resenaAudioUrl": "https://…/galaxia.mp3",
    "sesiones": [{ "sala": "Sala 2", "dias": [1, 2, 3, 4], "horas": ["17:00", "20:30"] }]
  }]
}
```

`dias` usa 0 = domingo … 6 = sábado. Aunque uses la API, conviene ejecutar `generar-modelo.js` cuando cambien los títulos, porque el reconocimiento de voz mejora con ellos. Si no está en el modelo, la skill busca el título de forma aproximada.

## Desarrollo y despliegue

```bash
cd lambda && npm install && npm test     # tests locales

npm i -g ask-cli                         # una vez
ask configure                            # vincula tu cuenta de Amazon Developer y AWS
ask deploy                               # crea la skill y la Lambda (eu-west-1)
ask dialog --locale es-ES                # prueba en la terminal
```

Antes de certificarla, sustituye los iconos de ejemplo de `skill.json` (108×108 y 512×512 px) y, si quieres, cambia el nombre de invocación («mi cine») en `es-ES.json`.
