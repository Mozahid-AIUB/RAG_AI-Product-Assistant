import { Injectable } from '@nestjs/common';
import { KnowledgeBaseStore } from './knowledge-base.store';
import { cosineSimilarity } from './similarity';
import { ProductRecord } from './product.types';

export interface RetrievedMatch {
  product: ProductRecord;
  score: number;
}

const TOP_K = 3;

@Injectable()
export class RetrievalService {
  constructor(private readonly store: KnowledgeBaseStore) {}

  findMatches(questionEmbedding: number[]): RetrievedMatch[] {
    const kb = this.store.load();

    const scored = kb.entries.map((entry) => ({
      product: entry.product,
      score: cosineSimilarity(questionEmbedding, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, TOP_K);
  }
}
