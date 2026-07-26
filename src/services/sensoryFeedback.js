import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

function browserSpeech(text, volume) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.volume = volume
  window.speechSynthesis.speak(utterance)
}

export async function speakGuidance(text, volume = 1) {
  if (!text) return

  try {
    if (Capacitor.isNativePlatform()) {
      await TextToSpeech.speak({ text, rate: 0.95, volume, lang: 'en-IN' })
      return
    }
  } catch {
    // Keep the browser fallback available if a device has no TTS engine.
  }

  browserSpeech(text, volume)
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
