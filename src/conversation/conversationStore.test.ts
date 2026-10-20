import { describe, expect, it } from "vitest";
import { createInMemoryConversationStore } from "./conversationStore.ts";

describe("createInMemoryConversationStore", () => {
  it("returns an empty history for an unknown chat", async () => {
    const store = createInMemoryConversationStore();
    expect(await store.getHistory(111)).toEqual([]);
  });

  it("returns turns from oldest to newest", async () => {
    const store = createInMemoryConversationStore();
    await store.appendTurn(111, { user: "q1", assistant: "a1" });
    await store.appendTurn(111, { user: "q2", assistant: "a2" });
    expect(await store.getHistory(111)).toEqual([
      { user: "q1", assistant: "a1" },
      { user: "q2", assistant: "a2" },
    ]);
  });

  it("keeps each chat separate", async () => {
    const store = createInMemoryConversationStore();
    await store.appendTurn(111, { user: "punyaku", assistant: "a" });
    await store.appendTurn(-100222, { user: "punya grup", assistant: "b" });
    expect(await store.getHistory(111)).toEqual([{ user: "punyaku", assistant: "a" }]);
    expect(await store.getHistory(-100222)).toEqual([{ user: "punya grup", assistant: "b" }]);
  });

  it("drops the oldest turn when maxTurns is exceeded", async () => {
    const store = createInMemoryConversationStore(2);
    await store.appendTurn(111, { user: "q1", assistant: "a1" });
    await store.appendTurn(111, { user: "q2", assistant: "a2" });
    await store.appendTurn(111, { user: "q3", assistant: "a3" });
    expect((await store.getHistory(111)).map((t) => t.user)).toEqual(["q2", "q3"]);
  });

  it("clears only the given chat", async () => {
    const store = createInMemoryConversationStore();
    await store.appendTurn(111, { user: "q", assistant: "a" });
    await store.appendTurn(222, { user: "q", assistant: "a" });
    await store.clear(111);
    expect(await store.getHistory(111)).toEqual([]);
    expect(await store.getHistory(222)).toHaveLength(1);
  });

  it("does not let callers change the stored history", async () => {
    const store = createInMemoryConversationStore();
    await store.appendTurn(111, { user: "q", assistant: "a" });
    // Tipe readonly hanya mencegah perubahan saat compile. Cast ini meniru kode yang
    // mengabaikannya, untuk membuktikan bahwa store benar-benar mengembalikan salinan.
    const history = (await store.getHistory(111)) as unknown as unknown[];
    history.pop();
    expect(await store.getHistory(111)).toHaveLength(1);
  });

  it.each([0, -1, 1.5])("rejects maxTurns=%s", (maxTurns) => {
    expect(() => createInMemoryConversationStore(maxTurns)).toThrow(RangeError);
  });
});
