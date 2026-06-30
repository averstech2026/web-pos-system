import { state } from './state.js';

export const voiceSession = {
  recognition: null,
  demoTimer: null,
  highlightId: null,
  highlightTimer: null,
};

export function stopVoiceRecognition() {
  if (voiceSession.demoTimer) {
    clearTimeout(voiceSession.demoTimer);
    voiceSession.demoTimer = null;
  }
  if (voiceSession.recognition) {
    try {
      voiceSession.recognition.stop();
    } catch (_) {
      /* noop */
    }
    voiceSession.recognition = null;
  }
  state.voiceListening = false;
}
