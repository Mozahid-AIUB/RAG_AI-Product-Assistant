# Product Knowledge Assistant

**Live demo:** https://rag-ai-product-assistant.onrender.com/
**API docs (Swagger):** https://rag-ai-product-assistant.onrender.com/api-docs
**Repo:** https://github.com/Mozahid-AIUB/RAG_AI-Product-Assistant

> Free hosting spins down when idle. First request after a while can take ~50 seconds to wake up. After that it's fast.

A backend that answers questions about a product catalogue in plain English. If a product isn't in the catalogue, it says so honestly instead of making something up. Built with NestJS and Google Gemini.

---

## Try it in 30 seconds

```bash
git clone https://github.com/Mozahid-AIUB/RAG_AI-Product-Assistant.git
cd RAG_AI-Product-Assistant
npm install
npm run start
```

Open `http://localhost:3000` for a simple chat UI, or call the API directly:

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

No setup step needed for your first query — the knowledge base is already built and committed.

---

## How it works

1. **Ingestion (`npm run ingest`, run once):** reads the Excel file, cleans up each row, and turns it into a short text description. Each description is sent to Gemini to get a vector (an "embedding"). All products + vectors get saved to `data/knowledge-base.json`.
2. **Answering a question (`POST /ask`):**
   - Turn the question into a vector, the same way.
   - Compare it to every stored product vector and find the closest matches.
   - If the closest match isn't close enough, reply "not available" and stop — the AI chat model is never even called.
   - If there's a good match, send just those few matched products (never the whole catalogue) to Gemini, along with the question, and return its answer.

This is the core idea: the AI only ever sees a handful of real products, and it's told never to make up details that aren't there.

---

## Setup

```bash
npm install
cp .env.example .env   # then add your GEMINI_API_KEY
```

Get a free key at https://aistudio.google.com/app/apikey. The submitted `.env` already has a working key.

## Re-running ingestion

Only needed if `products_data.xlsx` changes. Place the file at `RAG/products_data.xlsx` (one folder above this one), then:

```bash
npm run ingest
```

This is a standalone script — it never runs automatically when the server starts.

## Running the server

```bash
npm run start                          # development
npm run build && npm run start:prod    # production
```

### API

```
POST /ask
Content-Type: application/json

{ "question": "What is the warranty on the Amazfit Bip 5?" }
```

Found:
```json
{ "found": true, "answer": "The warranty on the Amazfit Bip 5 Smartwatch is 12 Months." }
```

Not found:
```json
{ "found": false, "answer": "Sorry, this product is not available in our catalogue. Try asking about a specific product, brand, or category — for example \"Anker power bank\" or \"JBL speaker\"." }
```

Add `?debug=true` to the URL to also get back the matched products and their similarity scores — helpful for seeing *why* a question got answered or rejected.

See [`requests.http`](./requests.http) for ready-to-run example requests, or open **`/api-docs`** ([live version](https://rag-ai-product-assistant.onrender.com/api-docs)) for interactive Swagger documentation.

### Environment variables

| Variable | What it's for |
|---|---|
| `GEMINI_API_KEY` | Your Gemini API key (free tier) |
| `PORT` | Server port, defaults to `3000` |
| `SIMILARITY_THRESHOLD` | How close a match needs to be before the system trusts it — see below |

---

## Why Google Gemini

One provider for both embedding and chat, so setup only needs one API key.

- **Embedding model:** `gemini-embedding-001`.
- **Chat model:** `gemini-flash-lite-latest`. I tried a newer model first (`gemini-3.6-flash`), but its free tier only allows 5 requests per minute, which broke almost instantly during testing. This one has a much bigger free quota.
- If Gemini ever replies with a rate-limit error, the app automatically waits a moment and retries a few times before giving up.

## How the similarity threshold was picked

This number decides how confident the system needs to be before it trusts a match. Get it wrong and the system either invents answers for products it doesn't have, or refuses to answer things it actually knows. So instead of guessing, I tested it against real questions and wrote down the scores (using the `?debug=true` flag).

- **Real matches scored 0.67–0.73.** For example, asking about the Anker PowerCore scored 0.73 against the real product.
- **The hardest trap case scored 0.60–0.64.** This is a real brand paired with a product we *don't* carry — like "Baseus Bowie D99" (we sell Baseus chargers, not that model). This is the exact mistake the brief warns about: matching on brand name alone instead of the actual product.
- **Totally unrelated questions scored 0.50–0.61** (e.g. "do you sell washing machines?").

I first tried `0.72`, but it rejected a real match ("Do you have any Baseus products?" scored 0.67). So I lowered it to **`0.65`** — that sits right between the trap-case scores and the real-match scores, fixing the false rejection without letting the trap cases through.

**One thing this can't fully fix:** broad questions like "which is the cheapest smartwatch?" don't match well against any single product, since they're asking about a whole category, not one item. I documented this as a known limitation rather than lowering the threshold enough to risk letting trap cases through.

**Two test questions from the brief don't match this exact data file** — it only has an Anker PowerCore **10000mAh** (not 20000mAh) and a JBL Go **3** (not Go 4). The system correctly says "not available" for both rather than answering with the wrong model number.

---

## Problems found in the spreadsheet, and how they were fixed

| Problem | Example | What I did |
|---|---|---|
| Prices written as text, in different formats | `"3,200"`, `"৳4,990"`, `"2,999 Taka"` | Stripped everything except numbers, then converted to a real number |
| Sale price vs. regular price | Blank Sale Price = no discount | Used sale price when it exists, otherwise regular price |
| Inconsistent capitalization | `"power bank"` vs `"POWER BANK"` | Normalized to title case |
| Extra spaces | `" Baseus 65W GaN Charger "` | Trimmed every text field |
| Missing data | Some rows had no warranty, stock, or price | Left as empty rather than guessing a value, so the AI can honestly say "not listed" |
| Duplicate row | Same product listed twice | Kept the first one, skipped and logged the rest |
| Mixed currency | One product priced in USD, the rest in BDT | Kept as-is and shown clearly, instead of silently converting |
| Stock quantity of `0` | One product truly out of stock | Treated as a real zero, correctly marked out of stock |

---

## What I'd improve with more time

- Broad/category questions (like "cheapest smartwatch") don't retrieve well — would need a different search strategy for those.
- No memory between questions — each one is answered on its own.
- No caching for repeated questions.
- The threshold was tuned on a small set of test questions; a bigger real-world sample would make it more solid.

## Project structure

```
src/
  ai/         Talks to Gemini (embeddings + chat, with retry handling)
  products/   Cleans the Excel data, does the similarity search, stores results
  ask/        The /ask endpoint itself: validation, controller, main logic
scripts/
  ingest.ts   Standalone script that builds the knowledge base
data/
  knowledge-base.json   Already-built knowledge base, committed to the repo
public/
  index.html  Simple chat UI
```
