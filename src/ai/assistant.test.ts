import { describe, expect, it } from "vitest";
import { createInMemoryConversationStore } from "../conversation/conversationStore.ts";
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

const CHAT_ID = 111;

// Client palsu yang merekam messages yang dikirim dan menjawab dari daftar hasil
// sesuai urutan panggilan (hasil terakhir dipakai ulang kalau panggilan lebih banyak).
function fakeClient(...results: (ChatResult | Error)[]) {
  const sent: (readonly ChatMessage[])[] = [];
  const client: OllamaClient = {
    async chat(messages) {
      sent.push(messages);
      const result = results[Math.min(sent.length - 1, results.length - 1)]!;
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
    async checkModelAvailable() {},
  };
  return { client, sent };
}

function answer(content: string, doneReason = "stop"): ChatResult {
  return { content, doneReason, promptTokens: 42 };
}

// Rakit assistant dengan store memori baru. Budget besar kecuali test butuh yang kecil.
function setup(client: OllamaClient, promptTokenBudget = 7168) {
  const store = createInMemoryConversationStore();
  const assistant = createAssistant({ client, store, promptTokenBudget });
  return { assistant, store };
}

describe("assistant.reply", () => {
  it("sends the system prompt followed by the user message on a new chat", async () => {
    const { client, sent } = fakeClient(answer("Halo!"));
    await setup(client).assistant.reply(CHAT_ID, "hai kera");

    expect(sent).toEqual([
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "hai kera" },
      ],
    ]);
  });

  it("returns the cleaned answer with log details", async () => {
    const { client } = fakeClient(answer("  Jakarta.  \n"));
    expect(await setup(client).assistant.reply(CHAT_ID, "ibu kota?")).toEqual({
      text: "Jakarta.",
      promptTokens: 42,
      historyTurns: 0,
    });
  });

  it("includes earlier turns of the same chat in the next request", async () => {
    const { client, sent } = fakeClient(answer("Soekarno."), answer("Surabaya."));
    const { assistant } = setup(client);

    await assistant.reply(CHAT_ID, "siapa presiden pertama?");
    const second = await assistant.reply(CHAT_ID, "dia lahir di mana?");

    expect(sent[1]).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "siapa presiden pertama?" },
      { role: "assistant", content: "Soekarno." },
      { role: "user", content: "dia lahir di mana?" },
    ]);
    expect(second.historyTurns).toBe(1);
  });

  it("does not mix history between chats", async () => {
    const { client, sent } = fakeClient(answer("A"), answer("B"));
    const { assistant } = setup(client);

    await assistant.reply(111, "rahasia chat 111");
    await assistant.reply(222, "halo");

    expect(sent[1]).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "halo" },
    ]);
  });

  it("drops old turns that do not fit the token budget", async () => {
    const { client, sent } = fakeClient(answer("ok"));
    // Cukup untuk system + pesan baru, tapi tidak untuk giliran sebelumnya.
    const { assistant, store } = setup(client, 600);
    await store.appendTurn(CHAT_ID, { user: "x".repeat(1000), assistant: "y" });

    const result = await assistant.reply(CHAT_ID, "halo");

    expect(result.historyTurns).toBe(0);
    expect(sent[0]).toHaveLength(2);
  });

  it("stores the answer without the truncation notice", async () => {
    const { client } = fakeClient(answer("Bagian pertama", "length"));
    const { assistant, store } = setup(client);

    const result = await assistant.reply(CHAT_ID, "cerita panjang");

    expect(result.text).toBe("Bagian pertama" + TRUNCATED_NOTICE);
    expect(await store.getHistory(CHAT_ID)).toEqual([
      { user: "cerita panjang", assistant: "Bagian pertama" },
    ]);
  });

  it("falls back to a friendly message and stores nothing when the model returns nothing", async () => {
    const { client } = fakeClient(answer("   "));
    const { assistant, store } = setup(client);

    expect((await assistant.reply(CHAT_ID, "?")).text).toBe(EMPTY_REPLY_FALLBACK);
    expect(await store.getHistory(CHAT_ID)).toEqual([]);
  });

  it("lets client errors propagate and leaves history unchanged", async () => {
    const { client } = fakeClient(new OllamaError("unreachable", "down"));
    const { assistant, store } = setup(client);
    await store.appendTurn(CHAT_ID, { user: "q", assistant: "a" });

    await expect(assistant.reply(CHAT_ID, "halo")).rejects.toBeInstanceOf(OllamaError);
    expect(await store.getHistory(CHAT_ID)).toEqual([{ user: "q", assistant: "a" }]);
  });
});

describe("assistant.resetConversation", () => {
  it("makes the next reply start without history", async () => {
    const { client, sent } = fakeClient(answer("Soekarno."), answer("Siapa?"));
    const { assistant } = setup(client);

    await assistant.reply(CHAT_ID, "siapa presiden pertama?");
    await assistant.resetConversation(CHAT_ID);
    await assistant.reply(CHAT_ID, "dia siapa tadi?");

    expect(sent[1]).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "dia siapa tadi?" },
    ]);
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
