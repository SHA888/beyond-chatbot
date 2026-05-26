# beyond-chatbot

LLMs are one branch of a much larger tree. This repo is a growing knowledge graph of the **statistics, data science, and AI** that lives beyond — and beneath — the chatbot.

## The idea

Every loss function, every optimizer, every probabilistic primitive, every classical ML method, every signal-processing trick a modern chatbot stands on top of has a name, a history, and a place in a larger map. Most of that map is invisible in the day-to-day discourse around LLMs.

This project makes the map navigable, one **atomic node** at a time:

- A node is a single concept — an algorithm, model class, framework, method, system, or mathematical construct.
- Each node has a one-sentence technical descriptor and a list of concrete real-world deployments. No hand-waving.
- **Edges between nodes are deliberately omitted.** You draw the graph. Different consumers want different topologies — taxonomic, historical, dependency, pedagogical — and a fixed edge set would foreclose that.

## What's in the repo today

| File | What it is |
|---|---|
| [`ai-nodes.yaml`](ai-nodes.yaml) | The catalog. **165 nodes** across 11 branches, from symbolic AI through reinforcement learning, with statistics, optimization, information theory, and signal processing as substrates. |

That's it for now. The catalog is the substance; tools that consume it (renderers, search, validators) can live here later.

## The node schema

The full schema is documented in the header of `ai-nodes.yaml`. Briefly:

| Field | Notes |
|---|---|
| `id` | kebab-case slug, stable identifier |
| `name` | canonical display name |
| `aliases` *(optional)* | common alternative names |
| `branch` | one of 11 fixed groupings (see file header) |
| `type` | `algorithm` · `method` · `model-class` · `system` · `framework` · `math-construct` |
| `era` | year or decade of significant introduction |
| `status` | `foundational` · `active` · `legacy` · `emerging` · `dormant` |
| `descriptor` | **one** technical sentence |
| `anchors` | list of **concrete, verifiable** real-world uses |

## Contributing

PRs are welcome. The bar for inclusion:

1. **Atomic.** One concept per node. If you find yourself writing "…and also…", it's probably two nodes.
2. **Concrete `anchors`.** Named systems, products, papers, or deployments — not "used in industry" or "widely applied".
3. **One-sentence `descriptor`.** Resist the urge to expand.
4. **Existing branches only.** If a concept doesn't obviously fit, it belongs in `cross-cutting`, not a new branch.
5. **YAML must parse.** Quick check:
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('ai-nodes.yaml'))"
   ```

Good PRs to open:

- Missing nodes within an existing branch.
- Better `anchors` for an existing node (more concrete, more verifiable).
- Tightening a `descriptor` that has drifted into two sentences.
- New `aliases` that people actually use in the wild.

Open an issue first if you want to argue for a new branch, a schema change, or removing/merging an existing node.

## Status

Version `0.1.0`. Early, growing, opinionated about conciseness.

## License

Dual:

- **Content** — `ai-nodes.yaml` and any future data / docs are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [`LICENSE-CC-BY-4.0`](LICENSE-CC-BY-4.0). Use and adapt freely with attribution.
- **Code** — any code that lands in this repo is licensed under MIT. See [`LICENSE-MIT`](LICENSE-MIT). No code lives here yet, but the license is in place for when it does.
