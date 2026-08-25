import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { ProductRecord } from '../products/product.types';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const CHAT_MODEL = 'gemini-flash-lite-latest';
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 429;
}

// The free tier occasionally returns 429 under bursts of requests. A short
// exponential backoff is enough to ride that out without failing the request.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= MAX_RETRIES) throw error;
      await sleep(1000 * 2 ** attempt);
      attempt++;
    }
  }
}

@Injectable()
export class GeminiService {
  private readonly client: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: this.config.get<string>('GEMINI_API_KEY'),
    });
  }

  async embedText(text: string): Promise<number[]> {
    const response = await withRetry(() =>
      this.client.models.embedContent({ model: EMBEDDING_MODEL, contents: text }),
    );
    const values = response.embeddings?.[0]?.values;
    if (!values) {
      throw new Error('Gemini returned no embedding values');
    }
    return values;
  }

  async answerFromProducts(
    question: string,
    matches: ProductRecord[],
  ): Promise<{ answered: boolean; answer: string }> {
    const systemPrompt = `You are a helpful, knowledgeable assistant for an online electronics store. Answer the customer's question using ONLY the product data provided below — never invent a price, link, stock figure, spec, or any detail that isn't present in the data.

Write like a friendly, competent salesperson, not a database dump:
- Lead with the direct answer to what was asked.
- Naturally weave in other details from the data that a shopper would actually want (price and any active discount, stock status, warranty, color, link) without turning the answer into a bulleted spec sheet unless the question is comparing several products.
- If several products match, briefly compare the ones that are actually relevant instead of listing everything.
- Keep it conversational and concise — a few sentences, not a wall of text.

Respond with JSON only, matching this shape: { "answered": boolean, "answer": string }.
Set "answered" to false if the product data provided does not actually contain what the question is asking for, and set "answer" to a short, friendly message saying so.
Set "answered" to true and write the answer as described above if the data does contain what's needed.`;

    const catalogueContext = matches
      .map((product) => JSON.stringify(product, null, 0))
      .join('\n');

    const prompt = `${systemPrompt}\n\nProduct data:\n${catalogueContext}\n\nQuestion: ${question}`;

    const response = await withRetry(() =>
      this.client.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      }),
    );

    const raw = response.text?.trim() ?? '';
    try {
      const parsed = JSON.parse(raw) as { answered: boolean; answer: string };
      return { answered: Boolean(parsed.answered), answer: parsed.answer };
    } catch {
      return { answered: true, answer: raw };
    }
  }
}
