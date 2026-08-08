import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { isSarvamConfigured, speakWithSarvam } from './sarvamTts'

function browserSpeech(text, volume) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.volume = volume
  utterance.lang = 'hi-IN'
  window.speechSynthesis.speak(utterance)
}

async function deviceSpeech(text, volume) {
  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.speak({ text, rate: 0.95, volume, lang: 'hi-IN' })
    return
  }
  browserSpeech(text, volume)
}

/**
 * Prefer Sarvam Indian voice when configured and online.
 * Fall back to on-device / browser TTS (hi-IN) if Sarvam is unavailable.
 */
export async function speakGuidance(text, volume = 1) {
  if (!text) return

  if (isSarvamConfigured()) {
    try {
      const played = await speakWithSarvam(text, { volume })
      if (played) return
    } catch (error) {
      console.warn('[tts] Sarvam unavailable, using device voice', error)
    }
  }

  try {
    await deviceSpeech(text, volume)
  } catch {
    browserSpeech(text, volume)
  }
}

export async function tapFeedback() {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light })
      return
    }
  } catch {
    // Fall through to the browser vibration API.
  }

  navigator.vibrate?.(12)
}

export async function signalGuidance({ text, isHazard = false, audio = true, vibration = true, audioVolume = 1, vibrationDuration = 420 }) {
  const vibrationPattern = isHazard ? [120, 80, 260] : [45]

  if (vibration) {
    try {
      if (Capacitor.isNativePlatform()) {
        if (isHazard) await Haptics.vibrate({ duration: vibrationDuration })
        else await Haptics.impact({ style: ImpactStyle.Light })
      } else {
        navigator.vibrate?.(vibrationPattern)
      }
    } catch {
      navigator.vibrate?.(vibrationPattern)
    }
  }

  if (audio) await speakGuidance(text, audioVolume)
}
