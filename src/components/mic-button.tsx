"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";

/**
 * Speak instead of type, using the browser's own speech-to-text (Web Speech API).
 * Renders nothing in browsers that don't support it (e.g. Firefox). Chrome and Edge send the audio to their
 * own speech service; Safari uses Apple's. LifeCart never receives audio, only the resulting text.
 */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;
const noSubscribe = () => () => {};

const getCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** `onText` gets each finished phrase; `onInterim` the words being heard right now (or "" when done). */
export function MicButton({ onText, onInterim, className }: { onText: (text: string) => void; onInterim?: (text: string) => void; className?: string }) {
  // false on the server and during hydration, the real answer in the browser (so the two renders match).
  const supported = useSyncExternalStore(
    noSubscribe,
    () => Boolean(getCtor()),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  // Stop listening if the page changes.
  useEffect(() => () => rec.current?.abort(), []);

  if (!supported) return null;

  const start = () => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onText(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      onInterim?.(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Microphone access is blocked. Allow it in your browser to speak.");
      else if (e.error === "no-speech") setError("Didn't hear anything. Try again.");
      else if (e.error !== "aborted") setError("Speech-to-text stopped. Try again, or type instead.");
    };
    r.onend = () => {
      setListening(false);
      onInterim?.("");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone.");
    }
  };
  const stop = () => rec.current?.stop();

  return (
    <span className={className}>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Speak instead of typing"}
        title={listening ? "Stop listening" : "Speak instead of typing"}
        className={
          listening
            ? "relative flex size-10 items-center justify-center rounded-full bg-destructive text-white shadow-sm"
            : "flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:border-primary hover:text-primary"
        }
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" aria-hidden />}
        {listening ? <Square className="relative size-4" fill="currentColor" aria-hidden /> : <Mic className="size-[18px]" aria-hidden />}
      </button>
      {error && (
        <span role="alert" className="absolute right-0 top-12 z-10 w-64 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-md">
          {error}
        </span>
      )}
    </span>
  );
}
