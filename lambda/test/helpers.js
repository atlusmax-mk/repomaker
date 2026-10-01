'use strict';

const { handler } = require('../index');

function envelope(request, { attributes = {}, audioPlayer = true, audioContext } = {}) {
  return {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: 'amzn1.ask.skill.test' },
      attributes,
      user: { userId: 'amzn1.ask.account.test' },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: { userId: 'amzn1.ask.account.test' },
        device: {
          deviceId: 'test',
          supportedInterfaces: audioPlayer ? { AudioPlayer: {} } : {},
        },
        apiEndpoint: 'https://api.eu.amazonalexa.com',
      },
      ...(audioContext ? { AudioPlayer: audioContext } : {}),
    },
    request: {
      requestId: 'amzn1.echo-api.request.test',
      timestamp: new Date().toISOString(),
      locale: 'es-ES',
      ...request,
    },
  };
}

function intentRequest(name, slots = {}, options) {
  const slotObjs = {};
  for (const [key, value] of Object.entries(slots)) {
    const slot = { name: key, value: value && value.value !== undefined ? value.value : value };
    if (value && value.id) {
      slot.resolutions = {
        resolutionsPerAuthority: [
          { status: { code: 'ER_SUCCESS_MATCH' }, values: [{ value: { name: value.value, id: value.id } }] },
        ],
      };
    }
    slotObjs[key] = slot;
  }
  return envelope(
    { type: 'IntentRequest', dialogState: 'STARTED', intent: { name, confirmationStatus: 'NONE', slots: slotObjs } },
    options
  );
}

function invoke(event) {
  return new Promise((resolve, reject) => {
    handler(event, {}, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

function speech(res) {
  return (res.response.outputSpeech && res.response.outputSpeech.ssml) || '';
}

module.exports = { envelope, intentRequest, invoke, speech };
