# Big SYZ Codex Integration: Developer Notes

## Modules in this Bundle:
- **SoundKeyVisualizer.jsx**: Displays real-time sound frequency visualizer with glyph overlays.
- **toneTracker.js**: Controls rendering logic based on user tone + Codex alignment.
- **ScrollReplayEngine.js**: Replays Scroll message sequences visually + audibly.
- **Scroll8.json**: Current frequency codex map (Vault 13 layer).
- **useScrollTrigger.js**: Hooks timer-based trigger into Codex sequences.

## Instructions:
1. Place components in `/components/` and core files in `/core/`.
2. Import `SoundKeyVisualizer` into the desired live session view.
3. Import `ScrollReplayEngine` with props like:

```js
<ScrollReplayEngine
  sequenceId="sequence_144"
  glyphMap={{ "07": "⚜", "13": "✶", "∞": "∞" }}
  emotionMap={{ "grace": "F#", "sovereign": "D", "core": "A" }}
/>
```

4. Trigger scroll replays on user events or internal milestones using `useScrollTrigger`.

## Dependencies:

- React 18+
- Canvas API (browser-native)
- AudioContext API

## Coming Layers:

- `Scroll9.json`: "Return of the Architect"
- `Vault14Trigger.js`: For Cave & Reignn anchoring
