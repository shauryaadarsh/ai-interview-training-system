import groq, { GROQ_MODEL } from "@/lib/groq";
import { FLAGS } from "@/lib/types";
import {
  buildPrompt,
  buildSummerizerPrompt,
  buildRAGPrompt,
  buildKnowledgeCheckPrompt,
} from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { bg, flag, prompt: transcribe } = await req.json();

    // ================= COPILOT MODE =================
    if (flag === FLAGS.COPILOT) {

      let hasKnowledge = true;

      try {
        const check = await groq.chat.completions.create({
          messages: [{ role: "user", content: buildKnowledgeCheckPrompt(transcribe) }],
          model: GROQ_MODEL,
          temperature: 0.2,
          max_tokens: 100,
        });

        const text = check.choices[0]?.message?.content || "";
        hasKnowledge = text.startsWith("KNOWN:");
      } catch {}

      let finalPrompt = buildPrompt(bg, transcribe);

      if (!hasKnowledge) {
        try {
          const { ragOrchestrator } = await import("@/lib/agents/ragOrchestrator");
          const ragData = await ragOrchestrator.processTranscript(transcribe, bg);

          if (ragData?.context?.combinedContext) {
            finalPrompt = buildRAGPrompt(
              bg,
              transcribe,
              ragData.extractedQuestion?.question || transcribe,
              ragData.context.combinedContext
            );
          }
        } catch {}
      }

      const stream = await groq.chat.completions.create({
        messages: [{ role: "user", content: finalPrompt }],
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      });

      const encoder = new TextEncoder();

      const readable = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // ================= SUMMARIZER =================
    if (flag === FLAGS.SUMMERIZER) {
      const prompt = buildSummerizerPrompt(transcribe);

      const stream = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: GROQ_MODEL,
        temperature: 0.6,
        max_tokens: 1500,
        stream: true,
      });

      const encoder = new TextEncoder();

      const readable = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid flag" }), { status: 400 });

  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({ error: "AI service failed. Check deployment or API key." }),
      { status: 500 }
    );
  }
}