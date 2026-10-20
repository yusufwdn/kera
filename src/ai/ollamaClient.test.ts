import { describe, expect, it } from "vitest";
import {
  createOllamaClient,
  OllamaError,
  type OllamaErrorKind,
} from "./ollamaClient.ts";

// Test unit ollamaClient dengan fetch palsu.
// Yang diverifikasi: bentuk request yang dikirim dan cara client menerjemahkan
// berbagai respon/kegagalan. Yang TIDAK diverifikasi: bahwa Ollama asli benar-benar
// menerima dan menjawab format ini (lihat ollamaClient.integration.test.ts).

type RecordedRequest = { url: string; init: RequestInit };

// Buat client dengan fetch palsu yang menjalankan `respond` untuk setiap request.
function setup(respond: (request: RecordedRequest) => Promise<Response>) {
  const requests: RecordedRequest[] = [];
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = { url: String(input), init: init ?? {} };
    requests.push(request);
    return respond(request);
  };

  const client = createOllamaClient({
    baseUrl: "http://ollama.test",
    model: "test-model",
    think: false,
    timeoutMs: 1_000,
    numCtx: 2048,
    maxOutputTokens: 256,
    fetch: fakeFetch as typeof fetch,
  });

  return { client, requests };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Jalankan promise dan kembalikan OllamaError-nya; gagal kalau tidak melempar OllamaError.
async function expectOllamaError(
  promise: Promise<unknown>,
  kind: OllamaErrorKind,
): Promise<OllamaError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(OllamaError);
    expect((error as OllamaError).kind).toBe(kind);
    return error as OllamaError;
  }
  throw new Error("Expected an OllamaError");
}

const USER_MESSAGE = [{ role: "user" as const, content: "halo" }];

describe("ollamaClient.chat", () => {
  it("sends a non-streaming chat request and returns the content", async () => {
    const { client, requests } = setup(async () =>
      jsonResponse({
        message: { role: "assistant", content: "Halo juga!" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 12,
      }),
    );

    const result = await client.chat(USER_MESSAGE);

    expect(result).toEqual({
      content: "Halo juga!",
      doneReason: "stop",
      promptTokens: 12,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://ollama.test/api/chat");
    expect(requests[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({
      model: "test-model",
      messages: USER_MESSAGE,
      stream: false,
      think: false,
      options: { num_predict: 256, num_ctx: 2048 },
    });
    expect(requests[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a truncated answer through doneReason", async () => {
    const { client } = setup(async () =>
      jsonResponse({
        message: { content: "Tentu! Berikut" },
        done_reason: "length",
      }),
    );
    const result = await client.chat(USER_MESSAGE);
    expect(result.doneReason).toBe("length");
    // Field opsional yang tidak dikirim Ollama menjadi undefined, bukan error.
    expect(result.promptTokens).toBeUndefined();
  });

  it("maps a refused connection to 'unreachable'", async () => {
    const { client } = setup(async () => {
      throw new TypeError("fetch failed");
    });
    await expectOllamaError(client.chat(USER_MESSAGE), "unreachable");
  });

  it("maps an aborted request to 'timeout'", async () => {
    const { client } = setup(async () => {
      throw new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
    });
    const error = await expectOllamaError(client.chat(USER_MESSAGE), "timeout");
    expect(error.message).toContain("1000 ms");
  });

  it("actually aborts a slow response using the timeout signal", async () => {
    // fetch palsu yang hanya selesai kalau signal dibatalkan, untuk membuktikan bahwa
    // client benar-benar memasang AbortSignal.timeout pada request.
    const { client } = setup(
      ({ init }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    await expectOllamaError(client.chat(USER_MESSAGE), "timeout");
  });

  it("maps HTTP 404 to 'model_not_found' and keeps Ollama's message", async () => {
    const { client } = setup(async () =>
      jsonResponse({ error: "model 'test-model' not found" }, 404),
    );
    const error = await expectOllamaError(
      client.chat(USER_MESSAGE),
      "model_not_found",
    );
    expect(error.message).toContain("model 'test-model' not found");
  });

  it("maps other HTTP errors to 'http_error'", async () => {
    const { client } = setup(
      async () => new Response("upstream exploded", { status: 500 }),
    );
    const error = await expectOllamaError(
      client.chat(USER_MESSAGE),
      "http_error",
    );
    expect(error.message).toContain("HTTP 500");
    expect(error.message).toContain("upstream exploded");
  });

  it("rejects a non-JSON body", async () => {
    const { client } = setup(
      async () => new Response("<html>proxy page</html>", { status: 200 }),
    );
    await expectOllamaError(client.chat(USER_MESSAGE), "invalid_response");
  });

  it.each([
    ["missing message", { done: true }],
    ["content is not a string", { message: { content: 42 } }],
    ["null body", null],
  ])("rejects a response with %s", async (_label, body) => {
    const { client } = setup(async () => jsonResponse(body));
    await expectOllamaError(client.chat(USER_MESSAGE), "invalid_response");
  });
});

describe("ollamaClient.checkModelAvailable", () => {
  it("calls /api/show with the configured model", async () => {
    const { client, requests } = setup(async () =>
      jsonResponse({ details: {} }),
    );
    await client.checkModelAvailable();
    expect(requests[0]!.url).toBe("http://ollama.test/api/show");
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({
      model: "test-model",
    });
  });

  it("reports a missing model", async () => {
    const { client } = setup(async () =>
      jsonResponse({ error: "model 'test-model' not found" }, 404),
    );
    await expectOllamaError(client.checkModelAvailable(), "model_not_found");
  });
});
