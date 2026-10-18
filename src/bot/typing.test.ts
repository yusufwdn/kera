import type { Context } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTypingIndicator } from "./typing.ts";

// ctx palsu yang hanya punya replyWithChatAction, karena hanya itu yang dipakai typing.ts.
function fakeContext(options: { fail?: boolean } = {}) {
  const replyWithChatAction = vi.fn(async () => {
    if (options.fail) {
      throw new Error("telegram down");
    }
    return true;
  });
  return { ctx: { replyWithChatAction } as unknown as Context, replyWithChatAction };
}

describe("withTypingIndicator", () => {
  // Fake timers: setInterval tidak berjalan sendiri; waktu dimajukan manual dengan
  // vi.advanceTimersByTimeAsync, sehingga test tidak perlu benar-benar menunggu.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends typing immediately and refreshes it until work finishes", async () => {
    const { ctx, replyWithChatAction } = fakeContext();
    let finish!: (value: string) => void;
    const work = new Promise<string>((resolve) => (finish = resolve));

    const result = withTypingIndicator(ctx, () => work, 4_000);
    expect(replyWithChatAction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(replyWithChatAction).toHaveBeenCalledTimes(3);

    finish("done");
    await expect(result).resolves.toBe("done");

    // Setelah selesai, timer harus berhenti.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(replyWithChatAction).toHaveBeenCalledTimes(3);
  });

  it("stops refreshing when work throws", async () => {
    const { ctx, replyWithChatAction } = fakeContext();

    await expect(withTypingIndicator(ctx, async () => Promise.reject(new Error("model failed")))).rejects.toThrow(
      "model failed",
    );

    await vi.advanceTimersByTimeAsync(20_000);
    expect(replyWithChatAction).toHaveBeenCalledTimes(1);
  });

  it("does not fail the work when the typing request fails", async () => {
    const { ctx } = fakeContext({ fail: true });
    await expect(withTypingIndicator(ctx, async () => "ok")).resolves.toBe("ok");
  });
});
