import { useState, useRef, useCallback, useEffect } from 'react'

function cleanForSpeech(text) {
  return text
    .replace(/#{1,6}\s+/g, '')                   // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')             // bold
    .replace(/\*(.+?)\*/g, '$1')                 // italic
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')        // code spans and blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // markdown links → label only
    .replace(/[^\w\s.,!?;:()'"-]/g, ' ')         // everything else non-standard
    .replace(/\s+/g, ' ')
    .trim()
}

export function useSpeech() {
  const [listening, setListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const recRef    = useRef(null)
  const cancelRef = useRef(false)

  const supported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    return () => {
      recRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  const startListening = useCallback((onTranscript, onNaturalEnd) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    cancelRef.current = false
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-NZ'
    rec.onresult = (e) => {
      if (cancelRef.current) return
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
      const isFinal = e.results[e.results.length - 1].isFinal
      onTranscript(transcript, isFinal)
    }
    rec.onend = () => {
      setListening(false)
      // cancelRef is true when stopListening() was called (user cancelled or speech was sent).
      // If it's still false, recognition ended naturally (timeout / no speech) — restart if needed.
      if (!cancelRef.current) onNaturalEnd?.()
    }
    rec.onerror = () => { setListening(false) }
    recRef.current = rec
    rec.start()
    setListening(true)
  }, [])

  const stopListening = useCallback(() => {
    cancelRef.current = true
    recRef.current?.stop()
    setListening(false)
  }, [])

  // speak accepts an optional onEnd callback (fires when utterance finishes naturally,
  // NOT when cancelled — used by handsfree mode to restart listening after TTS)
  const speak = (text, onEnd) => {
    if (!ttsEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(cleanForSpeech(text))
    utt.lang = 'en-NZ'
    if (onEnd) utt.onend = onEnd
    window.speechSynthesis.speak(utt)
  }

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return {
    listening,
    ttsEnabled,
    setTtsEnabled,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    supported,
  }
}
