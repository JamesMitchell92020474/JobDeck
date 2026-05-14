import { useState, useRef, useCallback, useEffect } from 'react'

function cleanForSpeech(text) {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^\w\s.,!?;:()'"\n-]/g, ' ')  // preserve \n for paragraph splitting
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function useSpeech() {
  const [listening,  setListening]  = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)

  const recRef       = useRef(null)
  const cancelRef    = useRef(false)
  const pauseTimerRef = useRef(null) // debounce timer for extended listening mode
  const ttsChainRef  = useRef(null)  // tracks active TTS chain for clean cancellation

  const supported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    return () => {
      clearTimeout(pauseTimerRef.current)
      recRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Starts the microphone.
  //
  // options.pauseBeforeSend (ms) — if set, uses continuous recognition and only
  // fires isFinal=true after this many ms of silence. Prevents early submission
  // when the user pauses briefly to collect their thoughts.
  const startListening = useCallback((onTranscript, onNaturalEnd, options = {}) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    cancelRef.current = false
    clearTimeout(pauseTimerRef.current)

    const { pauseBeforeSend = 0 } = options

    const rec = new SR()
    rec.continuous     = pauseBeforeSend > 0  // continuous mode for extended listening
    rec.interimResults = true
    rec.lang           = 'en-NZ'

    rec.onresult = (e) => {
      if (cancelRef.current) return
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
      const isFinal    = e.results[e.results.length - 1].isFinal

      if (pauseBeforeSend > 0) {
        // Always show as interim while accumulating; only submit after silence
        onTranscript(transcript, false)
        if (isFinal) {
          clearTimeout(pauseTimerRef.current)
          pauseTimerRef.current = setTimeout(() => {
            if (!cancelRef.current && transcript) {
              rec.stop()
              onTranscript(transcript, true)
            }
          }, pauseBeforeSend)
        }
      } else {
        onTranscript(transcript, isFinal)
      }
    }

    rec.onend = () => {
      clearTimeout(pauseTimerRef.current)
      setListening(false)
      if (!cancelRef.current) onNaturalEnd?.()
    }

    rec.onerror = (e) => {
      clearTimeout(pauseTimerRef.current)
      if (e.error === 'no-speech') {
        // Silence timeout — treat as natural end so voice mode can restart
        setListening(false)
        if (!cancelRef.current) onNaturalEnd?.()
      } else {
        // Real error (permission denied, no mic) — stop the loop
        cancelRef.current = true
        setListening(false)
      }
    }

    recRef.current = rec
    rec.start()
    setListening(true)
  }, [])

  const stopListening = useCallback(() => {
    cancelRef.current = true
    clearTimeout(pauseTimerRef.current)
    recRef.current?.stop()
    setListening(false)
  }, [])

  // Reads text aloud, splitting on paragraph/bullet breaks so there's a natural
  // pause between sections rather than one continuous stream.
  const speak = (text, onEnd) => {
    if (!ttsEnabled || !window.speechSynthesis) return

    ttsChainRef.current = null
    window.speechSynthesis.cancel()

    const cleaned = cleanForSpeech(text)
    const chunks = cleaned
      .split(/\n{2,}|\n(?=[-\d])/)
      .map(s => s.replace(/\n/g, ' ').trim())
      .filter(Boolean)

    if (chunks.length === 0) return

    const chainId = Symbol()
    ttsChainRef.current = chainId
    let i = 0

    const speakNext = () => {
      if (ttsChainRef.current !== chainId) return
      if (i >= chunks.length) { onEnd?.(); return }
      const utt = new SpeechSynthesisUtterance(chunks[i++])
      utt.lang  = 'en-NZ'
      utt.onend = () => {
        if (ttsChainRef.current === chainId) setTimeout(speakNext, 350)
      }
      window.speechSynthesis.speak(utt)
    }
    speakNext()
  }

  const stopSpeaking = useCallback(() => {
    ttsChainRef.current = null
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
