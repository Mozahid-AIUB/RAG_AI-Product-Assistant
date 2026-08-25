# Product Knowledge Assistant

A NestJS backend that answers questions about a product catalogue using
retrieval augmented generation (RAG). It never invents products — if a
question isn't confidently matched to something in the spreadsheet, it says
so instead of guessing.

## How it works

1. `npm run ingest` reads `products_data.xlsx`, cleans each row into a
   `Product`, and builds one embedding text per product (name, brand,
   category, description, color).
2. Each product's text is sent to Gemini's `text-embedding-004` to get a
   vector. Products + vectors are written to `data/knowledge-base.json`.
3. At request time, `POST /ask` embeds the incoming question with the same
   model, compares it against every stored vector with cosine similarity,
   and takes the top 3 matches.
4. If the best match scores below `SIMILARITY_THRESHOLD`, the server returns
   `found: false` immediately — the chat model is never called.
5. If there's a confident match, the matched products (not the whole
   catalogue) are sent to Gemini Flash with a system prompt that forbids it
   from inventing details, and its answer is returned.

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (a working key is
already included in the submitted `.env`). Get a free key at
https://aistudio.google.com/app/apikey.

## Running ingestion

Place `products_data.xlsx` one directory above `backend/` (i.e.
`RAG/products_data.xlsx`), then:

```bash
npm run ingest
```

This writes `data/knowledge-base.json`. It only needs to run once, or
whenever the spreadsheet changes. It does not run automatically when the
server starts. A built `data/knowledge-base.json` is already committed, so
you can skip this step and query immediately.

## Running the server

```bash
npm run start
```

Server listens on `http://localhost:3000`. A minimal chat UI is served at
`http://localhost:3000/`. The API:

```
POST /ask
Content-Type: application/json

{ "question": "How much is the Anker PowerCore 20000mAh?" }
```

Add `?debug=true` to the query string to get back the matched products and
their similarity scores alongside the answer.

## Environment variables

See `.env.example`:

- `GEMINI_API_KEY` — Google Gemini API key (free tier)
- `PORT` — server port, defaults to 3000
- `SIMILARITY_THRESHOLD` — cosine similarity cutoff below which the server
  refuses to answer, see below

## Provider choice

Both embedding and chat use **Google Gemini**. Reason: one provider, one API
key, generous free tier, no separate signup for a second service.

- Embedding: `gemini-embedding-001`. (The brief mentions `text-embedding-004`,
  but that model has been retired on the current API — `gemini-embedding-001`
  is its replacement.)
- Chat: `gemini-flash-lite-latest`. I initially tried `gemini-3.6-flash`, but
  its free tier caps out at **5 requests/minute**, which failed almost
  immediately under manual testing. `gemini-flash-lite-latest` has a
  noticeably higher free quota and held up under rapid back-to-back requests
  in testing.
- Rate limits are also handled in code: `GeminiService` wraps every Gemini
  call in a small retry-with-exponential-backoff helper that specifically
  catches HTTP 429 (`scripts/ingest.ts` additionally adds a fixed 300ms delay
  between embedding calls, since ingestion fires ~30 requests back to back).

## Choosing the similarity threshold

Threshold is set to `0.65` in `.env.example`. This was arrived at empirically
by running the real test questions from the brief against the actual
catalogue and reading off `?debug=true` scores, not by guessing:

- Genuine matches scored **0.67–0.73**: e.g. "How much is the Anker PowerCore
  10000mAh?" → 0.73 against the real product; "Do you have any Baseus
  products?" → 0.67 against the Baseus charger; "Show me power banks under
  2000 taka" → 0.73 against the Symphony P20.
- The brief's own trap case — a stocked brand paired with a model that
  doesn't exist ("Baseus Bowie D99", "Xiaomi Watch S4") — consistently scored
  **0.60–0.64**. This is the exact failure mode the brief warns about
  (matching on brand alone), and it's what the threshold is really being
  tuned against.
- Category-only or unrelated questions ("Do you sell washing machines?",
  "Do you have fresh milk?", "what is your return policy?") scored **0.50–0.61**.
- I first tried `0.72` (a round number above the brand-collision band) but it
  rejected a genuine case ("Do you have any Baseus products?" at 0.67).
  Lowering to `0.65` sits in the gap between the brand-collision band (≤0.64)
  and the genuine-match band (≥0.67), fixing that false negative without
  reopening any of the trap cases.
- This is still a judgment call on ~30 products and a handful of test
  questions, not a provably optimal number — with more time I'd log score
  distributions from a much larger set of real queries.

### A retrieval limitation this threshold can't fix

Aggregate/superlative questions like "Which is the cheapest smartwatch you
have?" don't score highly against any single product's embedding, because no
single product's description text is semantically close to a category-wide
question. Lowering the threshold enough to catch this would also let through
the brand-collision trap cases, so I left it as a known limitation (see
below) rather than trading away the not-found accuracy the brief weights
highest.

### Two brief test questions that don't match this data file

- "How much is the Anker PowerCore **20000mAh**?" — the sheet only contains
  an Anker PowerCore **10000mAh**. The system correctly returns `found:
  false` rather than answering with the 10000mAh product's price, since that
  would misrepresent a different product as the one asked about.
- "Give me the link for the JBL Go **4**." — the sheet only contains a JBL Go
  **3**. Same reasoning: returns `found: false` rather than substituting a
  different model number.

Per the brief's own rule ("if something here is ambiguous, decide for
yourself and write the assumption down"), I treated these as the system
correctly refusing to conflate two different product model numbers, rather
than as bugs to paper over by loosening the threshold.

## Data problems found in the spreadsheet, and what was done

- **Prices stored as text with mixed formats** — `"3,200"`, `"৳4,990"`,
  `"2,999 Taka"`, `"1200 tk"`, `" 950 "`. Handled by stripping everything
  except digits and a decimal point before parsing to a number.
- **Sale Price vs Product Price** — a blank Sale Price means no discount.
  `effectivePrice` is computed as `salePrice ?? price`, and that's the number
  used when the question is about "price".
- **Inconsistent casing** — Category values like `"power bank"` /
  `"POWER BANK"` / `"Power Bank"`, Brand values like `"baseus"` vs `"Anker"`.
  Normalized to title case so grouping/matching isn't casing-sensitive.
- **Stray whitespace** — e.g. `" Baseus 65W GaN Charger "`, `"black "`.
  Trimmed on every text field.
- **Blank cells** — missing Warranty, Stock Quantity, Sale Price, and one row
  with no Price at all (`OnePlus Buds Z2`). These are kept as `null` rather
  than defaulted to 0 or a fake value, so the chat model can honestly say
  "warranty not listed" instead of inventing one.
- **Duplicate row** — `P-1017` (Ugreen 20000mAh Power Bank) appears twice
  with identical data. The ingestion script keeps the first occurrence and
  logs the ID of every row it skips as a duplicate.
- **Mixed currency** — one product (`Anker Nano II 30W Charger`) is priced in
  `USD` while everything else is `BDT`. Currency is kept as-is per product
  and included in the embedding text and the answer, rather than silently
  converted, since no exchange rate was provided.
- **Stock Quantity of `"0"`** — parsed as a real zero rather than treated as
  "missing", so `inStock` correctly comes out `false` for it.

## Known limitations / what I'd improve with more time

- Retrieval is single-vector cosine similarity over ~30 products; fine at
  this scale, would need an actual vector index past a few thousand rows.
- Category-wide / superlative questions ("cheapest smartwatch") don't
  retrieve reliably, since similarity is computed per-product, not
  per-category. Would need either a category-aggregation step before
  retrieval or a larger top-K with a re-ranking pass.
- No conversation history — each question is independent (follow-ups like
  "and what about the price?" won't resolve pronouns).
- The threshold was tuned against the brief's own test questions, not a
  large labeled set; a bigger held-out set of real questions would make it
  more defensible.
- No caching of repeated identical questions.
