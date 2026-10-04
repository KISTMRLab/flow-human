# Reimplementation requirements

This browser application reproduces Flow Human's authoring/runtime ideas without the unavailable institute service, Unity assets, gesture library, or speech API.

## Required behavior

1. Provide a visual canvas where non-programmers add, move, edit, connect, import, and export dialogue and feedback nodes.
2. Support linear edges plus conditional branches over choice, numeric, or free-text feedback.
3. Validate one start node, valid targets, reachable termination, and feedback configuration before running.
4. Execute a session with explicit current node, transcript, answers, variables, and behavior event history.
5. Emit dialogue, gesture, viseme, and feedback events for host integration.
6. Provide a portable browser preview with speech synthesis, a schematic digital human, mouth cues, gestures, idle motion, and a feedback form.
7. Keep the saved flow plain JSON and independent of this preview.

## Deliberate boundaries

- The preview is a semantic behavior renderer, not the original 3D digital human.
- Browser speech voices vary by operating system and are not the paper's Naver voice.
- Visemes are deterministic text-derived timing cues, not phoneme alignment from generated audio.
- Gesture names are integration events. The schematic preview visualizes them; no original 2,035-animation library is included.

## Acceptance checks

- Pure JavaScript tests cover conditional branching, behavior event construction, and graph validation.
- Browser source runs without a build step or network dependency.

