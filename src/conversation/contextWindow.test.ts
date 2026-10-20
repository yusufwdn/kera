import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  estimateMessageTokens,
  promptTokenBudget,
} from "./contextWindow.ts";
import type { Turn } from "./conversationStore.ts";

// Teks 25 karakter -> ceil(25 / 2.5) + 8 = 18 token per pesan, 36 per giliran.
const TEXT_25 = "x".repeat(25);
// "s" dan "u" masing-masing 1 karakter -> 1 + 8 = 9 token. Prompt tetap = 18 token.
const SYSTEM = "s";
const USER = "u";
const FIXED_TOKENS = 18;
const TURN_TOKENS = 36;

function turn(label: string): Turn {
  return { user: `${label}-q`.padEnd(25, "."), assistant: `${label}-a`.padEnd(25, ".") };
}

describe("estimateMessageTokens", () => {
  it("counts the role overhead even for empty content", () => {
    expect(estimateMessageTokens("")).toBe(8);
  });

  it("rounds the content estimate up", () => {
    expect(estimateMessageTokens("abcde")).toBe(2 + 8);
    expect(estimateMessageTokens("abcdef")).toBe(3 + 8);
    expect(estimateMessageTokens(TEXT_25)).toBe(18);
  });
});

describe("promptTokenBudget", () => {
  it("reserves room for the answer", () => {
    expect(promptTokenBudget(8192, 1024)).toBe(7168);
  });
});

describe("buildPrompt", () => {
  it("sends only system and the new message when there is no history", () => {
    const result = buildPrompt({ systemPrompt: SYSTEM, history: [], userText: USER, budget: 1000 });
    expect(result).toEqual({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER },
      ],
      historyTurns: 0,
    });
  });

  it("keeps the whole history in order when it fits", () => {
    const history = [turn("t1"), turn("t2")];
    const result = buildPrompt({ systemPrompt: SYSTEM, history, userText: USER, budget: 1000 });
    expect(result.messages.map((m) => `${m.role}:${m.content.slice(0, 4)}`)).toEqual([
      "system:s",
      "user:t1-q",
      "assistant:t1-a",
      "user:t2-q",
      "assistant:t2-a",
      "user:u",
    ]);
    expect(result.historyTurns).toBe(2);
  });

  it("drops the oldest turns first when the budget is exceeded", () => {
    const history = [turn("t1"), turn("t2"), turn("t3")];
    // Muat tepat 2 giliran: batas <= berarti budget yang pas persis masih diterima.
    const budget = FIXED_TOKENS + 2 * TURN_TOKENS;
    const result = buildPrompt({ systemPrompt: SYSTEM, history, userText: USER, budget });
    expect(result.historyTurns).toBe(2);
    expect(result.messages[1]!.content).toMatch(/^t2-q/);
    expect(result.messages.at(-1)).toEqual({ role: "user", content: USER });
  });

  it("drops one more turn when the budget is one token short", () => {
    const history = [turn("t1"), turn("t2"), turn("t3")];
    const budget = FIXED_TOKENS + 2 * TURN_TOKENS - 1;
    const result = buildPrompt({ systemPrompt: SYSTEM, history, userText: USER, budget });
    expect(result.historyTurns).toBe(1);
    expect(result.messages[1]!.content).toMatch(/^t3-q/);
  });

  it("never skips over a large turn to keep an older one", () => {
    const large: Turn = { user: "x".repeat(1000), assistant: "y" };
    const history = [turn("old"), large, turn("new")];
    // Cukup untuk "old" + "new", tapi tidak untuk giliran besar di tengah.
    const budget = FIXED_TOKENS + 2 * TURN_TOKENS;
    const result = buildPrompt({ systemPrompt: SYSTEM, history, userText: USER, budget });
    expect(result.historyTurns).toBe(1);
    expect(result.messages[1]!.content).toMatch(/^new-q/);
  });

  it("still sends the new message when it alone exceeds the budget", () => {
    const longText = "z".repeat(5000);
    const result = buildPrompt({
      systemPrompt: SYSTEM,
      history: [turn("t1")],
      userText: longText,
      budget: 100,
    });
    expect(result.historyTurns).toBe(0);
    expect(result.messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: longText },
    ]);
  });
});
