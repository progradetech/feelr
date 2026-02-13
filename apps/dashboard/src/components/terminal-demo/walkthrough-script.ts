export interface WalkthroughStep {
  type: "typing" | "output" | "pause";
  text?: string;
  prompt?: string;
  lines?: string[];
  duration?: number;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  { type: "typing", prompt: "$ ", text: "feelr init", duration: 60 },
  { type: "pause", duration: 400 },
  {
    type: "output",
    lines: [
      "Feelr CLI v1.0.0",
      "Initializing workspace...",
      "API key: flr_****...7f3a",
      "Gateway: https://api.feelr.dev",
      "Ready! Run `feelr run <action>` to get started.",
    ],
  },
  { type: "pause", duration: 800 },
  {
    type: "typing",
    prompt: "$ ",
    text: "feelr run github.list-repos",
    duration: 50,
  },
  { type: "pause", duration: 600 },
  {
    type: "output",
    lines: [
      "{",
      '  "ok": true,',
      '  "data": [',
      '    { "name": "feelr", "stars": 1247, "language": "Go" },',
      '    { "name": "api-gateway", "stars": 89, "language": "TypeScript" },',
      '    { "name": "cli-plugins", "stars": 34, "language": "Go" }',
      "  ]",
      "}",
    ],
  },
  { type: "pause", duration: 1200 },
];
