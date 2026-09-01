import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { encryptSecret, decryptSecret } from "@/server/ai/crypto";
import { completeChat, type SupportedAiProvider } from "@/server/ai/llm";
import { groundedContext } from "@/server/rag/binsg";

const providerEnum = z.enum(["NONE", "OPENAI", "ANTHROPIC", "OPENAI_COMPATIBLE"]);

async function loadLlmConfig(db: PrismaClient, userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.aiProvider === "NONE" || !user.aiApiKeyEncrypted) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No AI provider configured. Add your API key in Settings → AI.",
    });
  }
  return {
    provider: user.aiProvider as SupportedAiProvider,
    apiKey: decryptSecret(user.aiApiKeyEncrypted),
    model: user.aiModel ?? "",
    baseUrl: user.aiBaseUrl,
  };
}

export const aiRouter = createTRPCRouter({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.session.user.id } });
    return {
      provider: user.aiProvider,
      model: user.aiModel,
      baseUrl: user.aiBaseUrl,
      hasKey: !!user.aiApiKeyEncrypted,
    };
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        provider: providerEnum,
        apiKey: z.string().min(1).optional(),
        model: z.string().optional(),
        baseUrl: z.string().url().optional().or(z.literal("")),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.provider === "OPENAI_COMPATIBLE" && !input.baseUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Base URL is required for a custom provider." });
      }

      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          aiProvider: input.provider,
          aiModel: input.model || null,
          aiBaseUrl: input.baseUrl || null,
          ...(input.apiKey ? { aiApiKeyEncrypted: encryptSecret(input.apiKey) } : {}),
        },
      });
      return { success: true };
    }),

  clearSettings: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { aiProvider: "NONE", aiApiKeyEncrypted: null, aiModel: null, aiBaseUrl: null },
    });
    return { success: true };
  }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const config = await loadLlmConfig(ctx.db, ctx.session.user.id);
    try {
      const reply = await completeChat(config, "Reply with only the word OK.", "Are you working?");
      return { success: true, reply: reply.trim().slice(0, 200) };
    } catch (err) {
      return { success: false, reply: err instanceof Error ? err.message : "Unknown error" };
    }
  }),

  draftDescription: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const config = await loadLlmConfig(ctx.db, ctx.session.user.id);
      const context = await groundedContext(ctx.db, ctx.session.user.organizationId, input.title);
      const description = await completeChat(
        config,
        "You write concise, practical software issue descriptions from a short title. " +
          "2-4 sentences max. No headers, no markdown, no restating the title verbatim. " +
          "Include likely context, scope, or acceptance criteria only if obvious from the title. " +
          "If related project context is given below, ground the draft in it rather than inventing " +
          "generic detail — but don't mention that context was provided.",
        context ? `${input.title}\n\n${context}` : input.title
      );
      return { description: description.trim() };
    }),
});
