import { describe, expect, it } from "vitest";
import {
  cleanModelOutput,
  createAssistant,
  EMPTY_REPLY_FALLBACK,
  SYSTEM_PROMPT,
  TRUNCATED_NOTICE,
} from "./assistant.ts";
import {
  OllamaError,
  type ChatMessage,
  type ChatResult,
  type OllamaClient,
} from "./ollamaClient.ts";

// Client palsu yang merekam messages yang dikirim dan mengembalikan hasil yang ditentukan test.
function fakeClient(result: ChatResult | Error) {
  const sent: (readonly ChatMessage[])[] = [];
  const client: OllamaClient = {
    async chat(messages) {
      sent.push(messages);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
    async checkModelAvailable() {},
  };
  return { client, sent };
}

describe("assistant.reply", () => {
  it("sends the system prompt followed by the user message", async () => {
    const { client, sent } = fakeClient({
      content: "Halo!",
      doneReason: "stop",
    });
    await createAssistant(client).reply("hai kera");

    expect(sent).toEqual([
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "hai kera" },
      ],
    ]);
  });

  it("returns the cleaned model answer", async () => {
    const { client } = fakeClient({
      content: "  Jakarta.  \n",
      doneReason: "stop",
    });
    expect(await createAssistant(client).reply("ibu kota?")).toBe("Jakarta.");
  });

  it("adds a notice when the answer was truncated", async () => {
    const { client } = fakeClient({
      content: "Bagian pertama",
      doneReason: "length",
    });
    expect(await createAssistant(client).reply("cerita panjang")).toBe(
      "Bagian pertama" + TRUNCATED_NOTICE,
    );
  });

  it("falls back to a friendly message when the model returns nothing", async () => {
    const { client } = fakeClient({ content: "   ", doneReason: "stop" });
    expect(await createAssistant(client).reply("?")).toBe(EMPTY_REPLY_FALLBACK);
  });

  it("lets client errors propagate to the caller", async () => {
    const { client } = fakeClient(new OllamaError("unreachable", "down"));
    await expect(createAssistant(client).reply("halo")).rejects.toBeInstanceOf(
      OllamaError,
    );
  });
});

describe("cleanModelOutput", () => {
  it("leaves normal answers untouched apart from trimming", () => {
    expect(cleanModelOutput(" Halo ")).toBe("Halo");
  });

  it("removes leaked reasoning ending with </think>", () => {
    // Bentuk ini teramati dari qwen3:4b dengan think=false (lihat milestone-02.md).
    const leaked =
      "Okay, the user asks... Let me think.\n</think>\n\nIbu kota Indonesia adalah Jakarta.";
    expect(cleanModelOutput(leaked)).toBe("Ibu kota Indonesia adalah Jakarta.");
  });

  it("removes a complete <think> block", () => {
    expect(cleanModelOutput("<think>\nhmm\n</think>\nJawaban")).toBe("Jawaban");
  });

  it("returns an empty string when there is only reasoning", () => {
    expect(cleanModelOutput("thinking only</think>")).toBe("");
  });
});
