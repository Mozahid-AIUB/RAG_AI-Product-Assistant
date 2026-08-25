import 'dotenv/config';
import * as XLSX from 'xlsx';
import { existsSync } from 'fs';
import { join } from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  buildEmbeddingText,
  dedupeProducts,
  normalizeRow,
  RawProductRow,
} from '../src/products/normalize';
import { KnowledgeBase, KnowledgeBaseEntry } from '../src/products/product.types';
import { writeFileSync } from 'fs';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EXCEL_PATH = join(process.cwd(), '..', 'products_data.xlsx');
const OUTPUT_PATH = join(process.cwd(), 'data', 'knowledge-base.json');
const EMBED_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found at ${EXCEL_PATH}`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not set in .env');
  }

  console.log(`Reading ${EXCEL_PATH}`);
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['Products'] ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawProductRow>(sheet, { defval: null });
  console.log(`Read ${rows.length} raw rows`);

  const normalized = rows
    .map((row) => normalizeRow(row))
    .filter((product): product is NonNullable<typeof product> => product !== null);

  const skippedForMissingFields = rows.length - normalized.length;
  if (skippedForMissingFields > 0) {
    console.log(`Skipped ${skippedForMissingFields} row(s) missing an ID or name`);
  }

  const { unique, duplicates } = dedupeProducts(normalized);
  if (duplicates.length > 0) {
    console.log(
      `Skipped ${duplicates.length} duplicate row(s): ${duplicates.map((d) => d.id).join(', ')}`,
    );
  }
  console.log(`${unique.length} unique products to embed`);

  const client = new GoogleGenAI({ apiKey });
  const entries: KnowledgeBaseEntry[] = [];

  for (let i = 0; i < unique.length; i++) {
    const product = unique[i];
    const embeddingText = buildEmbeddingText(product);
    console.log(`[${i + 1}/${unique.length}] Embedding ${product.id} - ${product.name}`);

    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: embeddingText,
    });
    const values = response.embeddings?.[0]?.values;
    if (!values) {
      throw new Error(`No embedding returned for product ${product.id}`);
    }

    entries.push({
      product: { ...product, embeddingText },
      embedding: values,
    });

    if (i < unique.length - 1) {
      await sleep(EMBED_DELAY_MS);
    }
  }

  const kb: KnowledgeBase = {
    model: EMBEDDING_MODEL,
    builtAt: new Date().toISOString(),
    entries,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(kb, null, 2), 'utf-8');
  console.log(`Wrote knowledge base with ${entries.length} products to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});
