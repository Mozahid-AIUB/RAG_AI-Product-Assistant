import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KnowledgeBase } from './product.types';

const KB_PATH = join(process.cwd(), 'data', 'knowledge-base.json');

@Injectable()
export class KnowledgeBaseStore {
  private readonly logger = new Logger(KnowledgeBaseStore.name);
  private cache: KnowledgeBase | null = null;

  load(): KnowledgeBase {
    if (this.cache) return this.cache;

    if (!existsSync(KB_PATH)) {
      throw new Error(
        `Knowledge base not found at ${KB_PATH}. Run "npm run ingest" first.`,
      );
    }

    const raw = readFileSync(KB_PATH, 'utf-8');
    this.cache = JSON.parse(raw) as KnowledgeBase;
    return this.cache;
  }

  save(kb: KnowledgeBase): void {
    writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), 'utf-8');
    this.cache = kb;
    this.logger.log(`Saved ${kb.entries.length} products to ${KB_PATH}`);
  }
}
