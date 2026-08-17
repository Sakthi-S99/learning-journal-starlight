---
title: Arivu RAG Pipeline — Reference Documentation (Phase 1–2)
description: Architecture, logic, and operational reference for the Arivu RAG pipeline.
---

**System:** Intel Core Ultra i7 · Intel Arc iGPU · 16GB RAM · Kubuntu
**Stack:** Ollama + BGE-M3 + Qdrant + fastembed (BM25 + reranker) + Plain Python
**Status:** Phase 1 (Infrastructure) complete · Phase 2 (Knowledge Base/RAG) built — hybrid search, reranking, and query expansion live; eval gate harness scaffolded, not yet run

---

## 1. Architecture

```
Local PDFs / Markdown (~/ai-knowledge-base, never committed to git)
        ↓
┌─────────────── INGESTION (ingest.py) ───────────────┐
│  Extract → Chunk → Embed → Store                     │
└────────────────────────────────────────────────────┘
        ↓
   Qdrant (collection: arivu_kb, 1024-dim, Cosine)
        ↓
┌─────────────── QUERY (ask.py) ───────────────────────┐
│  Embed question → Search top-K → Build context →      │
│  Prompt LLM → Answer (context-grounded)                │
└────────────────────────────────────────────────────┘
```

Project layout:
```
~/arivu-rag/
├── config/settings.py     ← single source of truth for all params
├── ingestion/ingest.py    ← parse → chunk → embed → store
├── query/ask.py           ← embed → search → context → generate
└── setup-qdrant.sh        ← Docker, on-demand (--restart=no)
```

---

## 2. Glossary — Keywords & Definitions

| Term | Definition |
|---|---|
| **RAG (Retrieval-Augmented Generation)** | Pattern where an LLM's answer is grounded by injecting relevant retrieved text into the prompt, instead of relying purely on the model's trained knowledge. Reduces hallucination, allows private/local data to inform answers without fine-tuning. |
| **Embedding** | A fixed-length numeric vector (1024 floats for BGE-M3) that represents the *meaning* of a piece of text. Similar meanings → vectors that sit close together in vector space. |
| **Vector DB** | A database optimized to store embeddings and answer "find me the N closest vectors to this one" queries fast, at scale. Qdrant is this layer here. |
| **Qdrant** | The vector DB used. Runs as a Docker container, stores vectors + arbitrary JSON metadata ("payload") per point, exposes REST/gRPC + a `qdrant-client` Python SDK. |
| **Collection** | Qdrant's equivalent of a table — a named group of vectors sharing the same dimensionality and distance metric. Here: `arivu_kb`. |
| **Point** | A single stored unit in Qdrant = `{id, vector, payload}`. One point = one text chunk. IDs are UUIDs so re-ingestion never collides. |
| **Distance Metric (Cosine)** | How "closeness" between two vectors is measured. Cosine similarity measures the angle between vectors, not magnitude — standard choice for normalized text embeddings. |
| **Chunking** | Splitting a long document into smaller pieces before embedding, because (a) embedding models have input limits and (b) retrieval precision improves when each chunk is topically narrow. |
| **Fixed-size chunking (chosen)** | Splits text into chunks of ~N tokens with a fixed overlap, regardless of document structure. Simple, predictable, cheap to compute. Current config: `CHUNK_SIZE=700`, `CHUNK_OVERLAP=100`. |
| **Semantic/structure-aware chunking (not used yet)** | Splits along natural boundaries (headers, paragraphs) instead of raw token counts. Better context integrity, more complex, format-dependent. Deferred until fixed-size proves insufficient. |
| **Overlap** | Tokens repeated between consecutive chunks so a concept split across a chunk boundary still appears whole in at least one chunk. |
| **Token vs Word approximation** | A token is a model's sub-word unit; this pipeline approximates using word counts (~1.3 words ≈ 1 token) to avoid pulling in a heavy tokenizer library — a deliberate tradeoff for a 16GB-RAM local box. |
| **BGE-M3** | The embedding model (via Ollama) that turns each chunk (and each query) into a 1024-dim vector. Already installed as part of Phase 1. |
| **Top-K retrieval** | At query time, Qdrant returns the K most similar chunks to the question's embedding. Current `TOP_K=5`. |
| **Context injection** | Concatenating retrieved chunks (with source labels) into the LLM prompt, so generation is constrained to what was retrieved. |
| **Context-only prompting / grounding** | Instructing the LLM explicitly to answer *only* from supplied context and say so if the answer isn't present — the main hallucination-mitigation lever in this design. |
| **Ingestion pipeline** | The offline/batch process: read files → chunk → embed → upsert into Qdrant. Run via `arivu-ingest` (`--reset` rebuilds the collection). |
| **Query pipeline** | The online/interactive process: embed a question → search → build context → call LLM → return answer with cited sources. Run via `arivu-ask`. |
| **Reranking** *(implemented)* | Cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`) re-scores the top-K retrieved chunks for relevance before they're sent to the LLM — improves precision beyond raw vector similarity. |
| **Hybrid search** *(implemented)* | Dense (BGE-M3) + sparse (BM25 via fastembed) search combined via Reciprocal Rank Fusion (RRF). Catches exact-term queries (error codes, ticket IDs) that pure semantic search can miss. |
| **RRF (Reciprocal Rank Fusion)** | Method for merging two ranked result lists (dense + sparse) into one score, using each result's *rank position* rather than raw similarity scores — avoids scale mismatches between cosine and BM25 scores. |
| **Named vectors** | Qdrant collections can hold multiple vector types per point (dense + sparse) under named fields. Adopting this for hybrid search is a **schema-breaking change** — requires `--reset` to re-ingest, since existing points only have the dense vector. |
| **Query expansion** | Expanding the user's query with a Guidewire acronym dictionary (BC, PC, CC, PPC, OOTB, etc.) before embedding/search, so abbreviated questions still match full-term document content. |
| **Score threshold filtering** | Discarding retrieved chunks below a minimum relevance score, so low-confidence matches don't get passed to the LLM as if they were reliable context. |
| **Content-hash deduplication** | Hashing retrieved chunk text and merging duplicates that appear across multiple source files, so the same content isn't sent to the LLM twice under different filenames. |
| **Metadata filtering** *(not yet implemented)* | Restricting Qdrant search to points matching payload conditions, e.g. `source == "billing-center"`, before/alongside vector search. |
| **Precision@k / Recall@k / MRR** | Retrieval evaluation metrics. Precision@k = fraction of top-k retrieved chunks that are relevant; Recall@k = fraction of all relevant chunks captured in top-k; MRR (Mean Reciprocal Rank) = how high the first relevant result ranks, averaged across test queries. Used as the Phase 2 gate criteria. |
| **LLM-as-judge** | Using an LLM to score generated answers against a reference/expected answer, as an automated proxy for answer-quality evaluation. |

---

## 3. Logic Behind the Scenes

### Ingestion (`ingest.py`)
1. **Extract** — `pypdf` for PDFs, direct read for `.md`/`.txt`. Unsupported types are skipped, not errored. Image/scan pages are flagged via a chars-per-page heuristic; table structures are detected and handled during extraction.
2. **Chunk** — word-based fixed-size splitting with overlap; a lightweight, dependency-free approximation of token-based chunking.
3. **Embed** — chunks are sent to Ollama's batch `/api/embed` endpoint (true batch calls, not one request per chunk), with adaptive batch sizing based on file size to balance throughput against RAM headroom.
4. **Store** — each embedding is upserted into Qdrant as a `PointStruct` with a deterministic UUID5 (derived from `source::chunk_index`) and payload `{source, chunk_index, text}`. Deterministic IDs make re-ingestion idempotent — re-running never creates duplicates.
5. **Resume & cleanup** — per-file progress is checkpointed to `.ingest_state.json`; a crash or interrupt resumes from the last completed file instead of restarting. `--clean-orphans` removes points whose source file no longer exists or was reduced to fewer chunks. `--reset` drops and recreates the collection entirely (required for schema changes, e.g. adopting named vectors for hybrid search).
6. **Logging** — structured, per-stage logs (extract / chunk / embed / upsert) for traceability during long ingestion runs.

### Query (`ask.py`)
1. **Expand** the query using a Guidewire acronym dictionary (BC, PC, CC, PPC, OOTB, etc.) so abbreviated questions still match full-term document content.
2. **Embed** the expanded question with the same BGE-M3 model (embedding symmetry between corpus and query is required for meaningful similarity).
3. **Hybrid search** — dense (BGE-M3, cosine) and sparse (BM25 via fastembed) results are retrieved in parallel and merged with Reciprocal Rank Fusion (RRF).
4. **Rerank** — a cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`) re-scores the fused candidates for relevance to the original question.
5. **Filter & dedup** — results below a minimum score threshold are dropped; remaining chunks are deduplicated by content hash so repeated text across files isn't sent to the LLM twice.
6. **Build context** by concatenating the surviving hits' `text`, labeled with `source`, separated by `---`.
7. **Generate** — the context and question are wrapped in a strict, anti-hallucination prompt template (*"Answer using ONLY the context below… if not present, say so"*) and sent to `qwen3-coder` (or `qwen3`) via `/api/generate`.
8. **Answer** is returned; sources are available for citation display.

### Why these specific design choices
- **Plain Python over LangChain/LlamaIndex** — deliberate: the goal was hands-on understanding of every step, and heavy frameworks abstract away exactly what was meant to be learned. Also avoids dependency bloat on a 16GB machine.
- **Word-approx chunking over a real tokenizer** — keeps ingestion light; a real tokenizer (e.g. `tiktoken`) is a candidate upgrade once accuracy matters more than simplicity.
- **UUID5 point IDs** — makes re-ingestion idempotent-safe; no accidental overwrites from colliding sequential IDs.
- **Local-only PDFs** — `~/ai-knowledge-base` is explicitly excluded from git; only pipeline code, config, and findings are published to the learning journal.
- **Hybrid search via named vectors is schema-breaking** — adding a sparse (BM25) vector alongside the existing dense vector changes the collection schema. Existing points only have the dense field, so a `--reset` re-ingest is required; this can't be layered on in place.
- **Query-side features layer independently** — query expansion and reranking don't touch the stored schema, so they were added without needing a re-ingest; only the hybrid-search change required one.

---

## 4. System Configuration Considerations

Every decision above is shaped by the constraint of a **16GB RAM, Intel Arc iGPU (no CUDA), single-model-at-a-time** setup:

- `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1` mean the embedding model and the generation model are never resident simultaneously by design — ingestion (embedding-heavy) and querying (generation-heavy) are naturally separated phases, which fits this constraint well.
- Qdrant runs with `--restart=no` — on-demand only, not a background service, consistent with the rest of the stack's philosophy.
- Avoiding LangChain/LlamaIndex also avoids their transitive dependency weight, which matters more on constrained RAM than on a workstation.
- Intel Arc has no CUDA path; any future GPU acceleration would need to go through Intel's oneAPI/SYCL or Vulkan compute backends — currently out of scope, everything runs on CPU via Ollama.

---

## 5. Current Limitations

- **Eval gate not yet run** — `eval.py` and the Phase 2 gate harness are scaffolded (Precision@k, Recall@k, MRR) but haven't been executed against real documents; pass/fail thresholds (pass rate ≥80%, MRR ≥0.6) are defined but unconfirmed.
- No metadata filtering — can't yet scope a query to "only BillingCenter docs" etc.
- Resume (`.ingest_state.json`) handles crash recovery and orphan cleanup, but there's no content-hash-based incremental re-ingest — editing a file still requires reasoning about whether `--reset` is needed.
- Reranker and hybrid fusion add latency per query — not yet benchmarked on this hardware to confirm it stays acceptable as the corpus grows.

---

## 6. Future Improvement Roadmap

**Near-term (close the Phase 2 gate):**
- Run `eval.py` against real BillingCenter PDFs/MD; confirm pass rate ≥80% and MRR ≥0.6 before moving to Phase 3.
- Add metadata filtering (`source`, `doc_type`) to Qdrant queries for scoped retrieval.
- Benchmark reranker + hybrid fusion latency on this hardware; tune `TOP_K` and score threshold based on real results, not assumptions.
- Swap word-approx chunking for a real tokenizer if boundary errors show up in testing.

**Mid-term (Phase 2 hardening → Phase 3+ readiness):**
- Hash-based incremental re-ingestion, so editing one file doesn't require reasoning about a full `--reset`.
- Expand the eval harness into a regression suite — run automatically after any chunking/retrieval config change.
- PostgreSQL layer (already in the target stack) for chat history / structured metadata, separating "what was asked" from "what was retrieved."

**Longer-term (per the phase roadmap already set):**
- Phase 7 — layer LangGraph orchestration on top of these proven internals, now that the fundamentals are understood firsthand.
- Phase 8 — Neo4j knowledge graph, once concept-relationship queries (not just similarity) become necessary — explicitly deferred until then.
- Explore Intel Arc acceleration (oneAPI/SYCL) if embedding/generation latency becomes a bottleneck as the corpus grows.

---

## 7. Evaluation (`eval.py`)

Phase 2 has a hard gate: no phase transition without passing evaluation.

- **LLM-as-judge** — scores generated answers against expected answers for a fixed query set.
- **Retrieval metrics** — Precision@k, Recall@k, MRR computed against known-relevant chunks per query.
- **Gate criteria** — pass rate ≥80%, MRR ≥0.6 required before Phase 3 (Teacher Agent) begins.
- **Status** — harness scaffolded, not yet executed against the real knowledge base.

---

## 8. Operational Reference

```bash
# Start Qdrant (on-demand)
bash setup-qdrant.sh

# Ingest documents
arivu-ingest              # add/update, resumes from .ingest_state.json if interrupted
arivu-ingest --reset      # full rebuild (required after schema changes, e.g. named vectors)
arivu-ingest --clean-orphans   # remove points for deleted/shrunk source files

# Query (query expansion → hybrid search → rerank → dedup → generate)
arivu-ask "How does delinquency cancellation work in BillingCenter?"
arivu-ask                 # interactive mode

# Evaluate (Phase 2 gate)
python eval.py            # runs Precision@k / Recall@k / MRR against eval_queries.json
```

Key config levers (`config/settings.py`): `CHUNK_SIZE`, `CHUNK_OVERLAP`, `TOP_K`, `COLLECTION`, `EMBED_MODEL`, `LLM_MODEL`, plus score-threshold and rerank-model settings for the query pipeline.
