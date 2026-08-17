---
title: Arivu RAG — Technical Reference
description: Running record of key concepts, decisions, and implementations across each phase.
---

> Running record of key concepts, decisions, and implementations across each phase. Used as human reference and as grounding material for future agents.

---

## Glossary — Core Keywords

| Term | Meaning |
|---|---|
| **Chunk** | A fixed-size slice of a document (700 words, 100 overlap) that becomes one searchable unit |
| **Embedding** | A 1024-dim vector representing the meaning of a chunk, produced by BGE-M3 |
| **Vector** | The numeric form of text used for similarity search |
| **Point** | A Qdrant record: `id` + `vector` + `payload` |
| **Payload** | Metadata + original text stored alongside a vector (`source`, `chunk_index`, `text`) |
| **Collection** | A named set of points in Qdrant (`arivu_kb`) |
| **Cosine similarity** | Distance metric — angle between vectors; measures meaning similarity |
| **HNSW** | Hierarchical Navigable Small World — graph index for fast approximate nearest-neighbor search |
| **Top-K** | Number of nearest chunks retrieved per query (5) |
| **RAG** | Retrieval-Augmented Generation — retrieve context, then generate answer grounded in it |
| **Idempotent ingest** | Re-running produces no duplicates (deterministic IDs) |
| **BM25** | Sparse (keyword-based) retrieval algorithm — scores documents by term frequency, offsetting semantic search's weakness on exact strings (error codes, ticket IDs) |
| **RRF (Reciprocal Rank Fusion)** | Merges dense-search and sparse-search rankings using rank position (not raw score), avoiding scale mismatches between cosine and BM25 |
| **Named vectors** | Qdrant collections storing multiple vector types (dense + sparse) per point under named fields — the mechanism behind hybrid search here |
| **Cross-encoder reranker** | A second model (`Xenova/ms-marco-MiniLM-L-6-v2`) that jointly scores (query, chunk) pairs post-retrieval for higher-precision ranking than vector similarity alone |
| **Query expansion** | Expanding the incoming query with a Guidewire acronym dictionary (BC, PC, CC, PPC, OOTB, etc.) before embedding, so abbreviations match full-term content |
| **Score threshold** | Minimum relevance score a retrieved chunk must clear to be passed into the LLM context |
| **Precision@k / Recall@k / MRR** | Retrieval eval metrics: Precision@k = relevant fraction of top-k; Recall@k = fraction of all relevant chunks captured; MRR = how high the first relevant hit ranks, averaged across queries |
| **LLM-as-judge** | Using an LLM to score generated answers against expected answers as an automated eval proxy |

---

## Architecture Decisions (ADRs)

### ADR-1: Qdrant over other vector DBs
- **Decision:** Qdrant
- **Why:** Local, fast, metadata filtering, production-ready, lightweight on 16GB
- **Rejected:** Cloud vector DBs (privacy), Neo4j (not needed until concept graphs)

### ADR-2: Plain Python over LangChain
- **Decision:** Plain Python + qdrant-client
- **Why:** Full pipeline visibility, learning value, reusable for PrithviVeda, no abstraction bloat
- **Revisit:** Layer LangChain at orchestration phase if needed

### ADR-3: Fixed-size chunking over semantic
- **Decision:** Fixed 700 words, 100 overlap
- **Why:** Simple, reliable, good for text-heavy docs
- **Revisit:** Structure-aware chunking if retrieval quality is poor

### ADR-4: Deterministic chunk IDs (UUID5)
- **Decision:** `uuid5(namespace, "source::index")`
- **Why:** Re-ingest overwrites instead of duplicating; crash-safe resume
- **Trade-off:** Editing a doc to fewer chunks leaves orphan points → use `--reset`

### ADR-5: Word-based chunking (no tokenizer)
- **Decision:** Split on words, ~1.3 words ≈ 1 token
- **Why:** Avoids heavy tokenizer dependency, keeps RAM low
- **Trade-off:** Approximate token counts — acceptable for retrieval

### ADR-6: Content-hash dedup at query time
- **Decision:** SHA256 of chunk text; merge duplicate content, keep all sources
- **Why:** Same text in 2 files wastes context window
- **Behavior:** `[Source: fileA.pdf, fileB.pdf]` for shared content

### ADR-7: On-disk vector storage
- **Decision:** `on_disk=True` on collection vectors
- **Why:** Vectors on SSD, HNSW index in RAM — frees memory for LLM during queries on 16GB
- **Trade-off:** Marginal cold-read latency (negligible on NVMe SSD)
- **Impact:** RAM footprint drops from ~120MB vectors to index-only (~20-40MB)

### ADR-8: Hybrid search — dense + sparse via named vectors
- **Decision:** Add BM25 sparse vectors (fastembed) alongside existing BGE-M3 dense vectors, fused via RRF
- **Why:** Pure dense search under-performs on exact terms (ticket IDs, error codes, class names) common in production support docs
- **Trade-off:** Schema-breaking change — named vectors require dropping and rebuilding the collection (`--reset`); existing points only carry the dense field
- **Layering:** Query-side features (expansion, reranking) don't touch storage schema and were added without a re-ingest; only this change required one

### ADR-9: Cross-encoder reranking
- **Decision:** `Xenova/ms-marco-MiniLM-L-6-v2` reranks the fused top-K before context is built
- **Why:** Vector/BM25 fusion ranks by proxy signals; a cross-encoder scores the actual (query, chunk) pair for tighter precision
- **Trade-off:** Adds per-query latency — not yet benchmarked on this hardware at scale
- **Revisit:** If latency becomes noticeable, consider reducing candidate pool size feeding the reranker

### ADR-10: Query expansion via acronym dictionary
- **Decision:** Expand queries using a hand-maintained Guidewire acronym dictionary (BC, PC, CC, PPC, OOTB, etc.) before embedding
- **Why:** Domain questions are frequently abbreviated; expansion improves match against full-term document content
- **Trade-off:** Dictionary is manually maintained — needs updating as new acronyms come up in practice

---

## Key Implementation Logic

### Chunking
- Word-split, sliding window of `size - overlap`
- Overlap preserves context across boundaries
- Empty chunks skipped

### Embedding
- Batch calls to Ollama `/api/embed` (not one request per chunk) — adaptive batch size based on file size, trading throughput against RAM headroom
- **Critical:** same model (`bge-m3:latest`) for ingest and query — vectors must share the same space
- Output: 1024-dim vector

### Extraction extras
- Image/scan pages flagged via a chars-per-page heuristic (low text density → likely scanned/image content)
- Table structures detected during extraction so tabular content isn't silently flattened into unreadable text

### Storage (Qdrant)
- Point = `id` (deterministic UUID5, `source::chunk_index`) + `vector` (1024d dense, +sparse for hybrid) + `payload`
- Upsert = update-or-insert on ID → idempotent
- Persisted in Docker volume `qdrant_storage`
- Named vectors (dense + sparse) required for hybrid search — schema change, needs `--reset`

### Resume & Cleanup
- `.ingest_state.json` tracks completed files
- Checkpoint after each file
- Crash → resume skips done files
- `--clean-orphans` removes points for files that were deleted or now produce fewer chunks
- `--reset` clears state + collection (full rebuild, required for schema changes)
- Structured per-stage logs (extract / chunk / embed / upsert) for traceability on long runs

### Retrieval
- Expand query (Guidewire acronym dictionary) → embed
- Hybrid search: dense (cosine) + sparse (BM25) retrieved in parallel, merged via RRF
- Rerank fused candidates with cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`)
- Drop results below score threshold
- Dedup by content hash
- Build context with source labels
- LLM answers from context only (anti-hallucination)

### Evaluation (`eval.py`)
- LLM-as-judge scores generated answers against expected answers for a fixed query set
- Precision@k, Recall@k, MRR computed against known-relevant chunks
- Phase 2 gate: pass rate ≥80%, MRR ≥0.6 required before Phase 3
- **Status:** harness scaffolded (`eval_rag.py`, `eval_queries.json`, `README.md`), not yet run against the real knowledge base

---

## Adding Documents — Workflow

### Routine additions (new files)
```bash
# 1. Drop new PDFs into the knowledge base
cp ~/Downloads/new-doc.pdf ~/ai-knowledge-base/

# 2. Start services
ollama-local && qdrant-start

# 3. Ingest — resume logic processes ONLY new files
arivu-ingest
```

### Editing / replacing an existing file
```bash
# State file marks it "done" → skipped on normal run
# Force full rebuild:
arivu-ingest --reset
```

### Best practices
- **Organize by folder** under `~/ai-knowledge-base/` (e.g. `guidewire/`, `java/`, `notes/`) — folder path becomes part of `source` metadata for future filtering
- **Batch additions** — drop several files, ingest once (fewer runs)
- **Verify before large runs** — ingest a small subset first, run test queries, confirm quality
- **Stop safely** — `Ctrl+C` after an `[ok]` line; resume skips completed files

### Memory tips (16GB)
- Ingest and query are separate — don't need Qwen loaded during ingest
- `on_disk=True` keeps vector RAM low
- Use Qwen2.5-Coder (lighter) for queries; avoid Qwen3 14B during heavy retrieval

---

### Required services for ingest
```bash
ollama-local        # BGE-M3 embedding
qdrant-start        # vector storage
# Open WebUI NOT required for ingest
```

### Health checks
```bash
curl http://localhost:11434/api/tags      # Ollama
curl http://localhost:6333/healthz         # Qdrant
```

### Storage location
- Docker volume: `qdrant_storage`
- Host: `/var/lib/docker/volumes/qdrant_storage/_data`
- Survives container restart

---

## Phase Log

### Phase 1 — Infrastructure ✅
- Ollama + 7 models (Qwen2.5-Coder, Qwen3-Coder, Qwen3 14B, Muse Glimmer, Mistral Nemo, Llama 3.1, BGE-M3)
- Open WebUI (Docker, on-demand)
- Continue.dev wired to VS Code
- `.bashrc` optimized for 16GB

### Phase 2 — Knowledge Base / RAG 🔄
- Qdrant vector DB, on-disk vectors
- Ingestion: parse → chunk → batch embed → store, with resume, orphan cleanup, structured logging, image/scan + table awareness
- Query: acronym expansion → hybrid search (dense + BM25 via RRF) → cross-encoder rerank → threshold filter → dedup → context → answer
- Deterministic UUID5 IDs, idempotent re-ingest
- Eval harness (`eval.py`) scaffolded — Precision@k, Recall@k, MRR gate (pass ≥80%, MRR ≥0.6)
- **Status:** Pipeline feature-complete for MVP; eval gate not yet run against the real knowledge base — this is the remaining blocker before Phase 3

### Phase 3+ — Agents (Planned)
- Teacher, Coding, Research, Memory agents
- Will reference this doc for grounding
- LangGraph orchestration

---

## For Future Agents

This section will hold agent-specific grounding as agents are introduced.

- **Retrieval interface:** agents call the same `retrieve()` → top-K chunks
- **Shared collection:** `arivu_kb` — all agents query the same KB
- **Extension point:** metadata filtering (by source, type, phase) for scoped retrieval

*To be expanded per agent in Phase 3+.*

---

## Related

- [RAG Pipeline](/ai-privacy/rag-pipeline/)
- [AI & Privacy — Arivu Stack](/ai-privacy/)
