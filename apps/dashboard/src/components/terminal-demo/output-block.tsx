"use client";

import { useEffect, useRef } from "react";

interface OutputBlockProps {
  lines: string[];
  onComplete?: () => void;
  className?: string;
}

export function OutputBlock({ lines, onComplete, className }: OutputBlockProps) {
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref stable to avoid stale closures
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onCompleteRef.current?.();
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div
      className={`animate-terminal-fade-in opacity-0${className ? ` ${className}` : ""}`}
    >
      {lines.map((line, i) => (
        <div key={i}>{line || "\u00A0"}</div>
      ))}
    </div>
  );
}
