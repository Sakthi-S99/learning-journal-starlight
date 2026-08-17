---
title: AI & Privacy
description: Building a private, offline-capable AI coding and productivity environment — no cloud dependency, no data leaks.
---

> Building a private, offline-capable AI coding and productivity environment — no cloud dependency, no data leaks.

---

## Philosophy

Most AI coding tools require sending your code to external servers. For enterprise development — especially in regulated industries like insurance — that's a non-starter. This section documents my personal local AI stack: fully offline, private, and optimized for a resource-constrained laptop.

---

## Hardware Profile

| Component | Spec |
|---|---|
| **CPU** | Intel Core Ultra i7 |
| **GPU** | Intel Arc (integrated) |
| **RAM** | 16GB |
| **Storage** | SSD |
| **OS** | Kubuntu (Linux) |

**Constraints:** No dedicated GPU, limited RAM — all model choices are optimized around this.

---

## Stack Architecture

```
VS Code
   │
Continue.dev          ← AI coding assistant (IDE plugin)
   │
Ollama                ← Local LLM runtime
   │
┌──────────────────────────────────────────┐
│  Qwen2.5-Coder 7B  → coding (primary)    │
│  Qwen3-Coder 30B   → advanced/agentic    │
│  Qwen3 14B         → reasoning           │
│  Muse Glimmer      → agentic experiments │
│  Mistral Nemo      → docs & explanations │
│  Llama 3.1 8B      → backup chat         │
│  BGE-M3            → embeddings / RAG    │
└──────────────────────────────────────────┘
```

**Why this stack:**

- **Ollama** — simple model management, REST API out of the box
- **Continue.dev** — replaces GitHub Copilot with fully local models
- **Role-separated models** — right model for the right task, not one model for everything
- **BGE-M3** — enables semantic codebase search and RAG without cloud indexing

---

## Setup

### 1. Visual Studio Code

```sh
sudo snap install code --classic
```

### 2. Ollama

```sh
curl -fsSL https://ollama.com/install.sh | sh

# Verify
ollama --version

# Start service
ollama serve
# Default endpoint: http://localhost:11434
```

### 3. Pull Models

```sh
ollama pull qwen2.5-coder:latest   # primary coding
ollama pull qwen3-coder:latest     # advanced coding / agentic
ollama pull qwen3:14b              # reasoning
ollama pull muse-glimmer:latest    # agentic / reasoning experiments
ollama pull mistral-nemo:latest    # docs & explanations
ollama pull llama3.1:8b            # backup
ollama pull bge-m3:latest          # embeddings

# Verify
ollama list
```

### 4. Continue.dev

- VS Code → Extensions → Search `Continue` → Install
- Config file: `~/.continue/config.yaml`
- Restart VS Code after configuring

### 5. Continue.dev Config (`~/.continue/config.yaml`)

```yaml
name: Local Config
version: 1.2.0
schema: v1

# Global defaults
defaultCompletionOptions:
  contextLength: 8192
  temperature: 0.2
  maxTokens: 2048

models:

  # Primary coding model — best balance of speed and coding quality
  # for daily development. Use for autocomplete, lightweight edits,
  # and normal coding.
  - name: Qwen2.5-Coder 7B
    provider: ollama
    model: qwen2.5-coder:latest
    roles:
      - chat
      - edit
      - apply
      - autocomplete
    defaultCompletionOptions:
      contextLength: 8192
      temperature: 0.15
      maxTokens: 2048
    autocompleteOptions:
      debounceDelay: 300
      maxPromptTokens: 1024
      onlyMyCode: true
      useImports: true
      useRecentlyEdited: true
      useRecentlyOpened: true
      useCache: true

  # Advanced coding / agent model — strongest coding model installed.
  # Use for difficult debugging, refactoring, architecture, multi-file
  # changes and agentic coding. Do NOT use this for autocomplete.
  - name: Qwen3-Coder 30B
    provider: ollama
    model: qwen3-coder:latest
    roles:
      - chat
      - edit
      - apply
    defaultCompletionOptions:
      contextLength: 8192
      temperature: 0.2
      maxTokens: 4096

  # General reasoning — good local model for reasoning, technical
  # explanations, architecture discussions and problem solving.
  - name: Qwen3 14B
    provider: ollama
    model: qwen3:14b
    roles:
      - chat
      - edit
    defaultCompletionOptions:
      contextLength: 8192
      temperature: 0.25
      maxTokens: 4096

  # Agentic / reasoning experimental model — useful for experimenting
  # with agentic workflows and complex reasoning. Kept out of
  # autocomplete because of its size.
  - name: Muse Glimmer
    provider: ollama
    model: muse-glimmer:latest
    roles:
      - chat
      - edit
      - apply
    defaultCompletionOptions:
      contextLength: 8192
      temperature: 0.4
      maxTokens: 4096

  # Documentation / explanation
  - name: Mistral Nemo
    provider: ollama
    model: mistral-nemo:latest
    roles:
      - chat
    defaultCompletionOptions:
      contextLength: 8192
      temperature: 0.3
      maxTokens: 3072

  # Lightweight fallback — fast, low-resource model
  - name: Llama 3.1 8B
    provider: ollama
    model: llama3.1:8b
    roles:
      - chat
    defaultCompletionOptions:
      contextLength: 8192
      temperature: 0.25
      maxTokens: 2048

  # Embeddings / codebase RAG — used for semantic codebase search
  # and embeddings.
  - name: BGE-M3
    provider: ollama
    model: bge-m3:latest
    roles:
      - embed
    embedOptions:
      maxChunkSize: 512
      maxBatchSize: 4

# Context providers — make Continue useful for repository-level development
context:
  - provider: code
  - provider: file
  - provider: diff
  - provider: terminal

# Development rules — steer chat/edit/agent behavior
rules:
  - |
    You are a senior software engineering assistant.
    Prefer understanding the existing codebase before suggesting changes.
  - |
    When modifying code:
    1. Preserve existing architecture and conventions.
    2. Avoid unnecessary refactoring.
    3. Explain important assumptions.
    4. Consider error handling, logging, performance and maintainability.
    5. Do not invent APIs, classes or configuration that are not present.
  - |
    For debugging:
    1. Identify the likely root cause.
    2. Explain why the issue occurs.
    3. Propose the smallest safe fix.
    4. Identify possible side effects.
    5. Suggest appropriate tests.
  - |
    For Guidewire/Gosu code:
    Prefer Guidewire-native patterns and existing project conventions.
    Do not replace Gosu with Java unless explicitly requested.
  - |
    For Java:
    Prefer clean object-oriented design, meaningful names,
    appropriate exception handling and testable code.
  - |
    For SQL:
    Prefer readable, performant queries and explain indexing
    or query-performance implications when relevant.
  - |
    Never expose, invent or request secrets such as passwords,
    API keys, tokens or private credentials.
```

### 6. Validate

```sh
curl http://localhost:11434/api/tags
```

---

## Model Selection Guide

| Model | Role | Best For |
|---|---|---|
| **Qwen2.5-Coder 7B** | Coding (primary) | Code gen, refactoring, debugging, autocomplete |
| **Qwen3-Coder 30B** | Advanced coding / agent | Hard debugging, multi-file changes, agentic coding (never autocomplete) |
| **Qwen3 14B** | Reasoning | Architecture decisions, complex analysis |
| **Muse Glimmer** | Agentic experiments | Experimenting with agentic workflows, complex reasoning |
| **Mistral Nemo** | Documentation | Write-ups, explanations, RCA drafts |
| **Llama 3.1 8B** | Backup | General chat when other models are loaded |
| **BGE-M3** | Embeddings | Codebase indexing, semantic search, RAG |

---

## Performance Optimization

:::tip[Running efficiently on 16GB RAM]
- Use **quantized models (Q4)** — significant RAM saving with minimal quality loss
- Global context window is **8192 tokens**, with per-model overrides (autocomplete stays lean at 1024 max prompt tokens)
- Temperature tuned per role — **0.15** for autocomplete, **0.2–0.25** for coding/reasoning, **0.4** for the experimental agentic model
- Run **one active model at a time** (`OLLAMA_MAX_LOADED_MODELS=1`) — Qwen3-Coder 30B or Qwen3 14B alongside anything else will strain 16GB
- Monitor memory: `htop` or `free -h`
- **Qwen3-Coder 30B** is the heaviest — close other apps before loading it
:::

---

## Open WebUI — Local Chat Interface

Browser-based UI for interacting with Ollama models — similar to ChatGPT but fully local.

**Image:** `ghcr.io/open-webui/open-webui:ollama`
**Access:** `http://localhost:3000`
**Restart policy:** `no` — starts only on demand

### On-Demand Control

```bash
webui-start    # start the container
webui-stop     # stop when done
webui-status   # check if running
```

### Initial Setup

```bash
# First-time run (already done — for reference)
docker run -d \
  --name open-webui \
  --restart=no \
  -p 3000:8080 \
  -v open-webui:/app/backend/data \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  ghcr.io/open-webui/open-webui:ollama

# Fix restart policy if needed
docker update --restart=no open-webui
```

:::tip[Workflow]
Start Ollama first (`ollama-local`), then Open WebUI (`webui-start`).
Stop both when done to free RAM.
:::

---

## `.bashrc` Configuration

Full optimized Ollama + WebUI block for `~/.bashrc`:

```bash
# ─── Ollama Local AI — Intel Core Ultra i7 + Arc + 16GB ──────────────────────

# Single inference — prevents RAM spikes
export OLLAMA_NUM_PARALLEL=1

# One model in memory at a time — essential for 16GB
export OLLAMA_MAX_LOADED_MODELS=1

# Keep model warm for 15min — prevents mid-session reloads
export OLLAMA_KEEP_ALIVE=15m

# Flash Attention — Intel Arc supports it, reduces memory per token
export OLLAMA_FLASH_ATTENTION=1

# Allow Continue.dev and local browser clients
export OLLAMA_ORIGINS="*"

# Ollama service
alias ollama-local='ollama serve'

# Quick model launch
alias ai-code='ollama run qwen2.5-coder:latest'
alias ai-agent='ollama run qwen3-coder:latest'
alias ai-think='ollama run qwen3:14b'
alias ai-muse='ollama run muse-glimmer:latest'
alias ai-docs='ollama run mistral-nemo:latest'

# Open WebUI — on-demand only
alias webui-start='docker start open-webui'
alias webui-stop='docker stop open-webui'
alias webui-status='docker ps --filter name=open-webui'

# Qdrant — vector DB, on-demand
alias qdrant-start='docker start qdrant'
alias qdrant-stop='docker stop qdrant'
alias qdrant-status='docker ps --filter name=qdrant'

# ─── Arivu — Local AI Project ─────────────────────────────────────────────────
# Project alias — update ARIVU_HOME if project is renamed or moved
export ARIVU_HOME="$HOME/projects/arivu"
export AI_PROJECT_NAME="arivu"         # rename here if project name changes

alias arivu='cd $ARIVU_HOME'
alias arivu-start='ollama-local & webui-start'   # start full stack
alias arivu-stop='webui-stop && pkill ollama'    # stop full stack
```

Apply changes:
```bash
source ~/.bashrc
```

---

## Troubleshooting

**Continue.dev can't detect Ollama:**
```sh
curl http://localhost:11434/api/tags
# If no response: ollama-local
```

**Open WebUI not loading:**
```sh
webui-status   # check if container is running
webui-start    # start if stopped
# Ensure Ollama is running first
```

**Performance is slow:**
- Switch to a lighter model (`ai-code` instead of `ai-think`)
- Lower `contextLength` in `config.yaml` (try 2048)
- Close heavy applications before inference

**System freezes:**
- Check RAM: `free -h`
- Qwen3-Coder 30B or Qwen3 14B are the likely cause — switch to `qwen2.5-coder` or `mistral-nemo`
- Increase swap space if RAM is consistently full
- Reduce project indexing in Continue settings

---

## Arivu — Local AI Project

**Arivu** (Tamil: *அறிவு* — intelligence, knowledge) is the name for this local AI setup.

| Property | Value |
|---|---|
| **Project name** | Arivu |
| **Alias** | `arivu` |
| **Home dir** | `~/projects/arivu` |
| **Stack** | Ollama + Open WebUI + Qdrant + BGE-M3 |
| **Purpose** | Private, local AI tooling for development and learning |

### Rename Guide

If the project name changes in future — update two places only:

```bash
# ~/.bashrc
export ARIVU_HOME="$HOME/projects/new-name"   # ← update path
export AI_PROJECT_NAME="new-name"              # ← update name

# Then rename the folder
mv ~/projects/arivu ~/projects/new-name
source ~/.bashrc
```

No other files need changing — everything else references `$ARIVU_HOME`.

<!---!!! note
    Arivu is separate from PrithviVeda AIOS. Arivu = personal local tooling. PrithviVeda = structured multi-agent platform (in progress).
-->
---

## Future Roadmap

- [ ] Upgrade to 32GB RAM
- [ ] Larger NVMe SSD
- [ ] Dedicated GPU workstation
- [ ] Local RAG integration (index codebase locally)
- [ ] Multi-agent orchestration
- [ ] Voice + automation layers

---

## Key Benefits

| Benefit | Detail |
|---|---|
| **Privacy** | No mandatory cloud dependency — code never leaves the machine |
| **Cost** | No recurring subscription |
| **Performance** | Optimized for available hardware with quantized models |
| **Scalability** | Modular — swap models or add layers without rebuilding the stack |

---

## Related

- [GitHub — Local AI Dev Stack](https://github.com/Sakthi-S99) ← *link your repo here*
