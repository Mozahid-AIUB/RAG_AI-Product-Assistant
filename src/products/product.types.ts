export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  description: string;
  price: number | null;
  salePrice: number | null;
  effectivePrice: number | null;
  currency: string;
  stockQuantity: number | null;
  inStock: boolean;
  warranty: string | null;
  vendor: string | null;
  color: string | null;
  productLink: string | null;
  imageUrl: string | null;
  dateAdded: string | null;
}

export interface ProductRecord extends Product {
  embeddingText: string;
}

export interface KnowledgeBaseEntry {
  product: ProductRecord;
  embedding: number[];
}

export interface KnowledgeBase {
  model: string;
  builtAt: string;
  entries: KnowledgeBaseEntry[];
}
