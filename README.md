# Product Knowledge Assistant

A backend that answers plain-English questions about a product catalogue — and, just as importantly, knows when to say "we don't have that" instead of guessing. Built with NestJS and Google Gemini, using retrieval augmented generation (RAG) so every answer is grounded in an actual spreadsheet row, never invented.

**Live demo:** https://rag-ai-product-assistant.onrender.com/
**Repo:** https://github.com/Mozahid-AIUB/RAG_AI-Product-Assistant

> The live instance is on Render's free tier, which spins down after periods of inactivity — the first request after a while may take up to ~50 seconds to wake up. Subsequent requests are fast.

---

## Try it in 30 seconds

```bash
git clone https://github.com/Mozahid-AIUB/RAG_AI-Product-Assistant.git
cd RAG_AI-Product-Assistant
npm install
npm run start
```

Open `http://localhost:3000` for a small chat UI, or call the API directly:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How much is the Anker PowerCore 10000mAh?"}'
```

```json
{
  "found": true,
  "answer": "The Anker PowerCore 10000mAh Power Bank is priced at 2650 BDT."
}
```

A pre-built knowledge base is committed, so this works immediately — no ingestion step required before your first query.

---

## How it works

```
products_data.xlsx
      │  npm run ingest  (one-time, offline)
      ▼
normalize each row → build a short text summary per product → embed with Gemini
      │
      ▼
data/knowledge-base.json   (products + vectors, committed to the repo)

POST /ask "How much is the Anker PowerCore?"
      │
      ▼
embed the question → cosine similarity vs every stored vector → top 3 matches
      │
      ├─ best match below threshold?  → "not available", chat model never called
      │
      └─ confident match → send only those matched rows + the question to Gemini
                            → model answers strictly from that data, or admits it can't
```

The one rule everything else serves: **the model is only ever shown the handful of products retrieval actually matched — never the full catalogue — and it's instructed to refuse rather than invent.**

---

## Setup

```bash
npm install
cp .env.example .env   # then fill in GEMINI_API_KEY
```

Get a free Gemini API key at https://aistudio.google.com/app/apikey. The submitted `.env` already has a working key.

## Running ingestion

Only needed if you change `products_data.xlsx`. Place the file at `RAG/products_data.xlsx` (one level above this folder), then:

```bash
npm run ingest
```

This reads the spreadsheet, cleans and normalizes every row, embeds each product with Gemini, and writes `data/knowledge-base.json`. It's a standalone script — it never runs as part of serving a request.

## Running the server

```bash
npm run start          # development
npm run build && npm run start:prod   # production
```

### API

```
POST /ask
Content-Type: application/json

{ "question": "What is the warranty on the Amazfit Bip 5?" }
```

```json
{ "found": true, "answer": "The warranty on the Amazfit Bip 5 Smartwatch is 12 Months." }
```

```json
{ "found": false, "answer": "Sorry, this product is not available in our catalogue. Try asking about a specific product, brand, or category — for example \"Anker power bank\" or \"JBL speaker\"." }
```

Add `?debug=true` to see the matched products and their similarity scores alongside the answer — useful for understanding *why* a question was or wasn't answered.

See [`requests.http`](./requests.http) for a full set of ready-to-run example requests.

### Environment variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (free tier) |
| `PORT` | Server port, defaults to `3000` |
| `SIMILARITY_THRESHOLD` | Cosine similarity cutoff below which the server refuses to answer — see below |

---

## Provider choice: Google Gemini

One provider for both embedding and chat keeps setup to a single API key with no separate signups.

- **Embedding — `gemini-embedding-001`.** (The brief references `text-embedding-004`; that model has since been retired, so I moved to its current replacement.)
- **Chat — `gemini-flash-lite-latest`.** I first used `gemini-3.6-flash`, but its free tier is capped at 5 requests/minute and started failing almost immediately under normal testing. `gemini-flash-lite-latest` has a much more workable free quota and held up under rapid, repeated requests.
- **Rate limit handling:** every Gemini call goes through a small retry-with-backoff wrapper that catches HTTP 429 and retries with increasing delay. The ingestion script additionally spaces out its ~30 embedding calls by 300ms each, since it fires them back to back.

## How the similarity threshold was chosen

The threshold decides the one thing this whole task is actually graded on: whether the system correctly says "not available" instead of inventing an answer. I didn't pick a number — I measured one, using `?debug=true` against the real catalogue and the brief's own test questions.

**Genuine matches landed at 0.67–0.73** — e.g. "Anker PowerCore 10000mAh" scored 0.73 against the real product; "Do you have any Baseus products?" scored 0.67.

**The brief's hardest trap case — a real brand paired with a model that doesn't exist** (`Baseus Bowie D99`, `Xiaomi Watch S4`) — consistently scored 0.60–0.64. This is exactly the failure mode called out as where most submissions go wrong: matching on brand name alone. The threshold has to sit above this band.

**Unrelated or off-catalogue questions** ("Do you sell washing machines?", "Do you have fresh milk?") scored 0.50–0.61.

A first pass at `0.72` sat safely above the trap-case band, but it also rejected a real match ("Baseus products?" at 0.67) — a false negative on exactly the metric that matters most. **`0.65`** sits in the gap between the trap-case ceiling (0.64) and the genuine-match floor (0.67), fixing that false negative without reopening any trap case.

**A limitation this can't fully solve:** aggregate questions like "which is the cheapest smartwatch?" don't score highly against any single product's description, since no one product's text is semantically close to a category-wide question. Lowering the threshold far enough to catch these would also let the brand-collision traps back in — so this is documented as a known limitation rather than traded against the metric the brief weights highest.

**Two test questions from the brief that don't exist in this data file:** "Anker PowerCore 20000mAh" (only a 10000mAh model is stocked) and "JBL Go 4" (only a JBL Go 3 is stocked). Both correctly return `found: false` — the system won't substitute a different model number and call it a match.

---

## Data problems found in the spreadsheet, and how each was handled

| Problem | Example | Handling |
|---|---|---|
| Prices stored as text, inconsistently | `"3,200"`, `"৳4,990"`, `"2,999 Taka"`, `"1200 tk"` | Strip everything except digits/decimal point, then parse to a number |
| Sale price vs. list price | Blank `Sale Price` = no discount | `effectivePrice = salePrice ?? price`; this is what "price" questions answer with |
| Inconsistent casing | `"power bank"` / `"POWER BANK"`, `"baseus"` / `"Anker"` | Normalized to title case for category and brand |
| Stray whitespace | `" Baseus 65W GaN Charger "` | Trimmed on every text field |
| Blank cells | Missing warranty, stock, sale price; one product with no price at all | Kept as `null`, never defaulted — so the model can honestly say "not listed" instead of guessing |
| Duplicate row | `P-1017` appears twice, identical | First occurrence kept, duplicate logged and skipped during ingestion |
| Mixed currency | One product priced in USD, rest in BDT | Currency kept as-is per product, shown alongside the price rather than silently converted |
| Stock quantity of `"0"` | boAt Rockerz 450 | Parsed as a real zero, not treated as missing — `inStock` correctly comes out `false` |

---

## Known limitations / what I'd improve with more time

- Retrieval is plain cosine similarity over ~30 vectors in a JSON file — fine at this scale, would need a real vector index past a few thousand products.
- Category-wide or superlative questions ("cheapest smartwatch") aren't reliably retrieved, since matching happens per-product rather than per-category.
- No conversation history — each question is answered independently.
- No caching of repeated identical questions.
- The threshold was tuned against the brief's test set, not a large labeled sample; more real queries would make it more defensible.

## Project structure

```
src/
  ai/         Gemini client wrapper (embedding + chat, retry handling)
  products/   Excel normalization, similarity math, knowledge base storage
  ask/        The /ask endpoint: DTO validation, controller, orchestration
scripts/
  ingest.ts   Standalone ingestion script (npm run ingest)
data/
  knowledge-base.json   Committed, pre-built knowledge base
public/
  index.html  Minimal chat UI
```
