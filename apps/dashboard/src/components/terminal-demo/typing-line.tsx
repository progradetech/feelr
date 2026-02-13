"use client";

import { useEffect, useRef, useState } from "react";

interface TypingLineProps {
  prompt?: string;
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

export function TypingLine({
  prompt,
  text,
  speed = 60,
  onComplete,
  className,
}: TypingLineProps) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref stable to avoid stale closures
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");

    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current > text.length) {
        clearInterval(interval);
        onCompleteRef.current?.();
        return;
      }
      setDisplayed(text.slice(0, indexRef.current));
    }, speed);

    return () => {
      clearInterval(interval);
    };
  }, [text, speed]);

  const isTyping = displayed.length < text.length;

  return (
    <div className={className}>
      {prompt && <span className="text-emerald-400">{prompt}</span>}
      <span>{displayed}</span>
      {isTyping && (
        <span className="ml-0.5 inline-block h-4 w-2 align-middle bg-zinc-300 animate-terminal-cursor" />
      )}
    </div>
  );
}
