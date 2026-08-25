import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from '../ai/gemini.service';
import { RetrievalService } from '../products/retrieval.service';

export interface AskResult {
  found: boolean;
  answer: string;
  debug?: {
    matches: { id: string; name: string; score: number }[];
    threshold: number;
  };
}

const NOT_AVAILABLE_MESSAGE =
  'Sorry, this product is not available in our catalogue. Try asking about a specific product, brand, or category — for example "Anker power bank" or "JBL speaker".';

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);
  private readonly threshold: number;

  constructor(
    private readonly gemini: GeminiService,
    private readonly retrieval: RetrievalService,
    private readonly config: ConfigService,
  ) {
    this.threshold = Number(this.config.get('SIMILARITY_THRESHOLD') ?? 0.65);
  }

  async ask(question: string, includeDebug = false): Promise<AskResult> {
    const questionEmbedding = await this.gemini.embedText(question);
    const matches = this.retrieval.findMatches(questionEmbedding);

    const debug = includeDebug
      ? {
          matches: matches.map((m) => ({
            id: m.product.id,
            name: m.product.name,
            score: Number(m.score.toFixed(4)),
          })),
          threshold: this.threshold,
        }
      : undefined;

    const best = matches[0];
    if (!best || best.score < this.threshold) {
      this.logger.log(
        `No confident match for "${question}" (best score: ${best?.score ?? 'n/a'})`,
      );
      return { found: false, answer: NOT_AVAILABLE_MESSAGE, debug };
    }

    const confidentMatches = matches.filter((m) => m.score >= this.threshold);
    const result = await this.gemini.answerFromProducts(
      question,
      confidentMatches.map((m) => m.product),
    );

    if (!result.answered) {
      return { found: false, answer: NOT_AVAILABLE_MESSAGE, debug };
    }

    return { found: true, answer: result.answer, debug };
  }
}
