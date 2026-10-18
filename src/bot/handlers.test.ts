import { describe, expect, it } from "vitest";
import { OllamaError, type OllamaErrorKind } from "../ai/ollamaClient.ts";
import { userMessageForError } from "./handlers.ts";

describe("userMessageForError", () => {
  it.each<[OllamaErrorKind, string]>([
    ["unreachable", "Pastikan Ollama sedang jalan"],
    ["timeout", "kelamaan mikir"],
    ["model_not_found", "belum terpasang"],
    ["http_error", "Cek log"],
    ["invalid_response", "Cek log"],
  ])("explains %s errors", (kind, expected) => {
    expect(userMessageForError(new OllamaError(kind, "detail"))).toContain(
      expected,
    );
  });

  it("never exposes the technical error message", () => {
    const message = userMessageForError(
      new OllamaError("http_error", "secret internal detail"),
    );
    expect(message).not.toContain("secret internal detail");
  });

  it("uses a generic message for unknown errors", () => {
    expect(userMessageForError(new Error("boom"))).toContain(
      "Maaf, ada kesalahan",
    );
  });
});
