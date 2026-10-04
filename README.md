# No-code Digital Human for Conversational Behavior

**Hanseob Kim, Jieun Kim, Ghazanfar Ali, Jae-In Hwang**

**SIGGRAPH Asia Posters · 2022** · Published

[Paper / publisher](https://doi.org/10.1145/3550082.3564175) · [Project page](https://ghazanfarali.com/research/flow-human/) · [BibTeX](CITATION.bib) · [Requirements](REQUIREMENTS.md) · [Code & setup](#implementation-and-usage)

> No-code conversation flows coordinate digital-human behavior.

![Method diagram from Figure 2 of the flow-human paper](paper-assets/method.png)

*Original method figure from the paper: Figure 2, PDF page 2. Extracted for this research introduction; the diagram describes the original system, not verification of this reimplementation.*

## Why this research

Creating a digital-human service normally requires coordinating dialogue, gesture, facial animation and feedback. A flow-based authoring interface makes those behaviors accessible to service designers.

Flow Human lets service designers create a conversation flow using an authoring tool. The system turns that flow into verbal and nonverbal behavior, presents a digital human in a kiosk interaction, and collects user feedback.

## Method at a glance

**Conversation flow** → **Behavior coordination** → **Digital-human interaction**

| | Research system |
|---|---|
| Input | An authored conversation flow |
| Method | Flow-based authoring and coordinated digital-human behavior |
| Output | Speech, facial animation, co-speech gesture, and feedback collection |

## Evidence and scope

System and use-case demonstration in a two-page poster

**Attribution:** These findings describe the paper or manuscript, not results obtained with this repository's code.

**Study context:** Kiosk use case described in the poster.

**Limitations:** Behavior depends on the authored flow and available modules; this poster does not establish unrestricted dialogue competence.

## Explore the implementation

A browser node editor with branching feedback, graph validation, session state, speech/gesture/viseme events and a schematic character preview.

This repository contains independently written research code. The institute's original source, datasets and trained models are not distributed. Public-data preparation, commands, assumptions and checks are documented below and in [REQUIREMENTS.md](REQUIREMENTS.md).

## Resources and citation

Read the paper through its [publisher record](https://doi.org/10.1145/3550082.3564175). PDFs are hosted by publishers or preprint archives rather than stored in this repository.

Please cite the research paper when using its ideas; [download the BibTeX citation](CITATION.bib). The implementation has its own documented scope.

## Implementation and usage

<!-- implementation-guide -->

This standalone browser project reimplements the central ideas from **“No-code Digital Human for Conversational Behavior”** by Hanseob Kim, Jieun Kim, Ghazanfar Ali, and Jae-In Hwang, SIGGRAPH Asia 2022 Posters, pp. 1–2. DOI: [10.1145/3550082.3564175](https://doi.org/10.1145/3550082.3564175).

The institute's original implementation is unavailable. This is a new, portable implementation of the paper's flow authoring, conversational behavior coordination, branching feedback, and runtime state. It does not contain the original Unity project, character/voice library, 2,035 gesture clips, learned gesture matcher, kiosk deployment, service data, or study results.

### Run

Start with the synthetic conversation using Node.js 20 or newer; no npm dependencies or model downloads are required:

```bash
npm run smoke
npm test
npm run check
```

The smoke run executes the same flow validation, branching and behavior coordination used by the browser. It writes `outputs/smoke/flow.json` and `session.json`, with a completed conversation and speech/gesture/viseme events. Import the generated flow into the browser to edit it.

To swap in your own content, export a flow from the editor and supply a JSON object mapping feedback node IDs to answers. The runtime and output event format stay the same:

```bash
node scripts/smoke.mjs --flow path/to/flow.json --answers path/to/answers.json --output outputs/my-flow
```

No package installation or build is required. Python is only used to serve ES modules locally:

```powershell
python -m http.server 8080
```

Open [http://localhost:8080/playground.html](http://localhost:8080/playground.html). Add dialogue and feedback nodes, drag them on the canvas, choose their outgoing targets and conditions, select the start node, validate, and run. Export produces portable JSON; import restores it.

For source verification with Node.js 20 or newer:

```powershell
npm test
npm run check
```

### What the runtime does

Each run creates session state with the current node, collected answers, variables, transcript, and a timestamped event history. Dialogue nodes emit `dialogue`, `gesture`, and deterministic text-timed `viseme` events. Feedback nodes render choice, 1–5 number, or text controls. Ordered branch rules (`=`, `≥`, `≤`, or contains) choose the next node; the default edge is used when none match.

The built-in figure is deliberately schematic. It previews idle blinking, mouth cues, gesture names, and optional browser speech synthesis. A production renderer can consume the same event log to drive a licensed avatar, phoneme-aligned lip synchronization, and a gesture system. Browser voices and the simple viseme heuristic are not replicas of the paper's Naver TTS and animation pipeline.

### Flow format

Flows are versioned JSON with `startId` and a `nodes` array. A node contains `id`, `type`, `text`, `gesture`, canvas coordinates, an optional default `next`, and, for feedback, `feedbackType`, `prompt`, `options`, and ordered `branches`. Content authors own and review their scripts and collected-feedback policy. No customer responses leave the browser in this implementation.
