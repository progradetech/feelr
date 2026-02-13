"use client";

import type { ReactNode } from "react";

interface TerminalShellProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function TerminalShell({
  title = "Terminal",
  children,
  className,
}: TerminalShellProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-500" />
        <div className="h-3 w-3 rounded-full bg-yellow-500" />
        <div className="h-3 w-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs text-zinc-500">{title}</span>
      </div>
      <div className="overflow-y-auto p-4 font-mono text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
    </div>
  );
}
