'use strict';

/**
 * Regenera el tipo de slot PELICULA del modelo de interacción a partir de
 * lambda/data/peliculas.json. Ejecútalo cada vez que cambie la cartelera:
 *
 *   node scripts/generar-modelo.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modelPath = path.join(root, 'skill-package/interactionModels/custom/es-ES.json');
const { peliculas } = require(path.join(root, 'lambda/data/peliculas.json'));

const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const type = model.interactionModel.languageModel.types.find((t) => t.name === 'PELICULA');
type.values = peliculas.map((p) => ({
  id: p.id,
  name: { value: p.titulo, synonyms: p.sinonimos || [] },
}));

fs.writeFileSync(modelPath, `${JSON.stringify(model, null, 2)}\n`);
console.log(`PELICULA actualizado con ${peliculas.length} películas.`);
