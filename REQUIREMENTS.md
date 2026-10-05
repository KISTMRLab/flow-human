# Reimplementation requirements

This browser application reproduces Flow Human's authoring/runtime ideas without the unavailable institute service, Unity assets, gesture library, or speech API.

## Required behavior

1. Provide a visual canvas where non-programmers add, move, edit, connect (drag between ports, or choose from dropdowns), import, and export chat and feedback nodes. Chat nodes hold a dialogue list spoken in order or as one random variant; a single `text` remains valid.
2. Support linear edges plus conditional branches over choice, numeric, or free-text feedback, and over session variables accumulated from weighted feedback (choice-option weights; number answers times an optional weight). Equality is numeric when both sides are numbers.
3. Validate one start node, valid targets, reachable termination, and feedback configuration (including non-empty choice options and numeric weights) before running.
4. Execute a session with explicit current node, transcript, answers, variables, and behavior event history.
5. Emit dialogue, gesture, viseme, feedback (with weight and running total), and transition events for host integration. Export the session (answers, variables, transcript, events) as JSON and CSV, and keep the flow and latest session in browser storage.
6. Provide a portable browser preview with speech synthesis, bundled fictional CC0 Three.js digital humans, renderer-driven lip motion, blink and idle motion, gestures, and a feedback form.
7. Keep the saved flow plain JSON and independent of this preview.

## Deliberate boundaries

- The preview is a semantic behavior renderer, not the original 3D digital human.
- Browser speech voices vary by operating system and are not the paper's Naver voice.
- Lip motion comes from the shared renderer's text-derived phoneme visemes (amplitude envelope on older renderer copies), not phoneme alignment from generated audio.
- Choosing a voice per digital human is not implemented.
- Gesture names remain integration events. The browser preview plays locally prepared BEAT clips or an imported rule map's frames for automatic dialogue and honors manual node gestures; the original 2,035-animation library is not included.

## Acceptance checks

- Pure JavaScript tests cover conditional and variable branching (including numeric equality), weighted feedback accumulation, dialogue lists, session JSON/CSV export, behavior event construction, graph validation, the gesture similarity floor and imported-frame playback data.
- Python tests cover TF-IDF and sentence-encoder rule matching with a similarity floor, the local-only SBERT loader, and the demo server running without numpy.
- Browser source runs without a build step after the pinned Three.js module has been prepared locally.


## Gesture component handoff

The paper modifies the authors' automatic text-to-gesture rule map. This implementation vendors the automatic retrieval dependencies and can also import an independently exported phrase/gesture map, optional finite equal-width word vectors, and motion frames. With vectors, summed-vector cosine selects the phrase in the browser; without them, the server matches with Sentence-BERT from a local model folder (`--sbert-model`) or TF-IDF. Scores below a similarity floor fall back to idle, and matched rules with frames drive avatar playback. Manual node gestures override retrieval. The same branching/session code drives speech, pose playback and feedback. Local Kokoro/faster-whisper are replaceable optional adapters, not the paper's original services. Tests must cover synonym retrieval, invalid vector widths and the similarity floor in addition to graph/branching behavior.

## Bundled fictional avatar substitution

Two newly generated fictional CC0 humanoids replace the original avatar assets in the browser demo. They provide a 53-bone rig and named ARKit/viseme targets. Motion retargeting adapts source joints to their bind pose; speaking envelopes approximate mouth motion rather than phoneme alignment. The optional recorded BEAT companion inspects public motion, face and audio files prepared locally, independently of the paper's learned algorithm. No dataset recordings or trained weights are bundled.

## Local recorded co-speech integration

The browser application retrieves prepared BEAT body-motion clips with `automatic` mode: the automatic rule-map lineage described in section 2.2 of the Flow Human paper. The first `python scripts/start_demo.py` run fetches a small official BVH/TextGrid sample, constructs a nine-clip bank, and fits the local retrieval artifact under ignored `outputs/beat-library/`. Install `scripts/requirements-demo.txt` first. Preparation code and method dependencies are vendored in this repository; no sibling clone, original institute library, full dataset, or pretrained weights are bundled. The flow editor, branch execution, feedback, and event history remain this application's core. The separate recorded-motion companion remains available for local motion/face/audio inspection.
