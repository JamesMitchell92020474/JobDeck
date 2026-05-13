// This hook (reusable piece of logic) handles everything to do with the
// microphone and text-to-speech in the app.
//
// It's used by both the global chat (Chat.jsx) and the per-job chat (ChatTab.jsx).
// "export function" means other files can import and use it.
import { useState, useRef, useCallback, useEffect } from 'react'

// Strips markdown formatting from text before reading it aloud.
// Without this, Claude's reply might say things like "asterisk asterisk bold text".
function cleanForSpeech(text) {
  return text
    .replace(/#{1,6}\s+/g, '')                   // remove heading markers (##, ###, etc.)
    .replace(/\*\*(.+?)\*\*/g, '$1')             // **bold** → just the word
    .replace(/\*(.+?)\*/g, '$1')                 // *italic* → just the word
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')        // remove inline code and code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // [link text](url) → just the text
    .replace(/[^\w\s.,!?;:()'"-]/g, ' ')         // replace unusual characters with a space
    .replace(/\s+/g, ' ')                         // collapse multiple spaces into one
    .trim()
}

// The main hook. Call this inside any React component to get access to
// microphone controls and text-to-speech.
export function useSpeech() {
  // "listening" tracks whether the microphone is currently active.
  const [listening,   setListening]   = useState(false)
  // "ttsEnabled" tracks whether Claude's responses should be read aloud.
  const [ttsEnabled,  setTtsEnabled]  = useState(false)

  // useRef stores a value that persists between re-renders without causing a re-render itself.
  // recRef holds the active SpeechRecognition object so we can stop it later.
  const recRef    = useRef(null)
  // cancelRef is a flag we set to true when the user deliberately stops recording,
  // so we know not to restart the mic automatically.
  const cancelRef = useRef(false)

  // Check whether the browser supports the Web Speech API.
  // Chrome and Edge support it; Firefox generally doesn't.
  const supported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // When the component using this hook is removed from the page,
  // clean up by stopping the mic and any ongoing speech.
  useEffect(() => {
    return () => {
      recRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Starts the microphone and listens for speech.
  //
  // "onTranscript(text, isFinal)" is called repeatedly as speech is recognised:
  //   - While the user is still speaking: isFinal = false (interim/partial result)
  //   - When the user pauses and the browser is confident: isFinal = true (final result)
  //
  // "onNaturalEnd" is called if recognition stops by itself (e.g. a timeout after
  //   5 seconds of silence) without the user or code explicitly stopping it.
  //   This is used by voice mode to restart the mic automatically.
  //
  // useCallback wraps the function so it's only re-created when its dependencies change.
  // Since there are no dependencies (empty []), this function is created once and reused.
  const startListening = useCallback((onTranscript, onNaturalEnd) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return  // do nothing if the browser doesn't support it

    cancelRef.current = false  // reset the cancel flag for this new session

    const rec = new SR()
    rec.continuous    = false  // stop after one natural pause (not continuous recording)
    rec.interimResults = true  // give us partial results while the user is still speaking
    rec.lang          = 'en-NZ'

    rec.onresult = (e) => {
      // If the user (or code) cancelled, ignore any results that still arrive.
      if (cancelRef.current) return
      // Join all recognised segments into one string.
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
      const isFinal    = e.results[e.results.length - 1].isFinal
      onTranscript(transcript, isFinal)
    }

    rec.onend = () => {
      setListening(false)
      // If recognition ended naturally (not because we called stop()),
      // call onNaturalEnd so the caller can decide whether to restart.
      if (!cancelRef.current) onNaturalEnd?.()
    }

    rec.onerror = () => {
      // On any error (e.g. no microphone connected, permission denied),
      // set the cancel flag so onNaturalEnd won't fire and restart the mic.
      cancelRef.current = true
      setListening(false)
    }

    recRef.current = rec
    rec.start()
    setListening(true)
  }, [])

  // Stops the microphone. Sets cancelRef so onNaturalEnd is not triggered.
  const stopListening = useCallback(() => {
    cancelRef.current = true
    recRef.current?.stop()
    setListening(false)
  }, [])

  // Reads text aloud using the browser's built-in text-to-speech.
  //
  // "onEnd" is an optional callback fired when the utterance finishes naturally
  //   (it does NOT fire if cancelled — this is important for the voice mode loop).
  //
  // Note: this is not wrapped in useCallback because it reads "ttsEnabled" and
  // "listening" directly from the current render, ensuring they're always fresh.
  const speak = (text, onEnd) => {
    if (!ttsEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()  // stop anything already playing
    const utt  = new SpeechSynthesisUtterance(cleanForSpeech(text))
    utt.lang   = 'en-NZ'
    if (onEnd) utt.onend = onEnd
    window.speechSynthesis.speak(utt)
  }

  // Immediately cancels any text-to-speech that is currently playing.
  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  // Return all the controls so the component using this hook can access them.
  return {
    listening,     // boolean — true when the mic is active
    ttsEnabled,    // boolean — true when read-aloud is turned on
    setTtsEnabled, // function to turn read-aloud on or off
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    supported,     // boolean — false if the browser can't use the mic at all
  }
}
