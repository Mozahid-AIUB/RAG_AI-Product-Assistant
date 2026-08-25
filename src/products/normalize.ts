import { Product } from './product.types';

export interface RawProductRow {
  'Product ID'?: string;
  'Product Name'?: string;
  Category?: string;
  Brand?: string;
  'Short Description'?: string;
  'Product Price'?: string;
  'Sale Price'?: string;
  Currency?: string;
  'Stock Quantity'?: string;
  Warranty?: string;
  Vendor?: string;
  Color?: string;
  'Product Link'?: string;
  'Image URL'?: string;
  'Date Added'?: string;
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Titlecases a value so "power bank" / "POWER BANK" / "Power Bank" all become one thing.
function normalizeLabel(value: unknown): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Prices in the sheet show up as "3,200", "৳4,990", "2,999 Taka", "1200 tk", " 950 ", or a plain number.
function parsePrice(value: unknown): number | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const numeric = cleaned.replace(/[^\d.]/g, '');
  if (!numeric) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStock(value: unknown): number | null {
  const cleaned = cleanText(value);
  if (cleaned === null) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRow(row: RawProductRow): Product | null {
  const id = cleanText(row['Product ID']);
  const name = cleanText(row['Product Name']);
  if (!id || !name) return null;

  const price = parsePrice(row['Product Price']);
  const salePrice = parsePrice(row['Sale Price']);
  const stockQuantity = parseStock(row['Stock Quantity']);

  return {
    id,
    name,
    category: normalizeLabel(row.Category) ?? 'Uncategorised',
    brand: normalizeLabel(row.Brand) ?? 'Unknown',
    description: cleanText(row['Short Description']) ?? '',
    price,
    salePrice,
    // A sale price, when present, is what the customer actually pays.
    effectivePrice: salePrice ?? price,
    currency: cleanText(row.Currency)?.toUpperCase() ?? 'BDT',
    stockQuantity,
    inStock: stockQuantity !== null && stockQuantity > 0,
    warranty: cleanText(row.Warranty),
    vendor: cleanText(row.Vendor),
    color: normalizeLabel(row.Color),
    productLink: cleanText(row['Product Link']),
    imageUrl: cleanText(row['Image URL']),
    dateAdded: cleanText(row['Date Added']),
  };
}

export function buildEmbeddingText(product: Product): string {
  const parts = [
    product.name,
    product.brand,
    product.category,
    product.description,
    product.color ? `Color: ${product.color}` : null,
  ].filter(Boolean);
  return parts.join('. ');
}

// Two rows count as duplicates when every field that matters for an answer is identical.
// Keeps the first occurrence and reports the rest so ingestion can log what it dropped.
export function dedupeProducts(products: Product[]): {
  unique: Product[];
  duplicates: Product[];
} {
  const seen = new Map<string, Product>();
  const duplicates: Product[] = [];

  for (const product of products) {
    const key = product.id;
    if (seen.has(key)) {
      duplicates.push(product);
      continue;
    }
    seen.set(key, product);
  }

  return { unique: Array.from(seen.values()), duplicates };
}
