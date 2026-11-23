import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handleWebhook } from "@/server/billing";

describe("no AI dependencies", () => {
  it("package.json has no AI/LLM SDKs", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const banned = /^(openai|ai|langchain|@langchain\/.*|@anthropic-ai\/.*|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/.*|ollama|@ai-sdk\/.*|replicate|groq-sdk)$/;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
  });
  it(".env.example contains no AI keys", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).not.toMatch(/OPENAI|ANTHROPIC|GEMINI|GROQ|MISTRAL|COHERE|XAI_API/i);
    expect(env).toMatch(/FEATURE_AI_GRADER="off"/);
  });
});

describe("Stripe webhook", () => {
  it("rejects requests without a valid signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    await expect(handleWebhook("{}", null)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(handleWebhook("{}", "t=1,v1=bad")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
