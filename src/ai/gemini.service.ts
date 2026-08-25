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
    const systemPrompt = `You are a product catalogue assistant. Answer the customer's question using ONLY the product data provided below. Never invent a price, link, stock figure, or any detail not present in the data.

Respond with JSON only, matching this shape: { "answered": boolean, "answer": string }.
Set "answered" to false if the product data provided does not actually contain what the question is asking for, and set "answer" to a short message saying so.
Set "answered" to true and write a short, factual answer (including concrete details like price, stock, warranty, or link when asked) if the data does contain what's needed.`;

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
