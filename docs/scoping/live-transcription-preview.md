# Live Transcription Preview in Chat Input

**Date:** 2026-03-03
**Status:** Scoping
**Complexity:** Small

---

## Current Architecture

### Voice Input (`src/features/voice/useVoiceInput.ts`)

The hook manages two parallel systems:

1. **Web Speech API (SpeechRecognition)** — used for wake-word detection and stop/cancel phrase matching. Runs with `interimResults: true` and `continuous: true`. The `onresult` handler reads interim transcripts but **only checks them against phrase lists** (wake, stop, cancel). The actual transcript text is discarded.

2. **MediaRecorder** — records audio as WebM/Opus. When the user stops recording, the blob is sent to `/api/transcribe` (server-side Whisper or similar). The server response is the only transcription surfaced to the caller via `onTranscription(text)`.

### Chat Input (`src/features/chat/InputBar.tsx`)

- **Uncontrolled textarea** — no React `value` prop. The DOM element's `.value` is read/written directly via `inputRef`. This is intentional (documented in a code comment) to support tab-completion and history navigation without controlled-input overhead.
- The `onTranscription` callback in InputBar wraps `onSend`: it immediately sends `"[voice] " + text`. There is **no intermediate step** where transcribed text appears in the input field.
- Voice state is visual only: recording/transcribing indicators shown via icons and status text.

### Data Flow Today

```text
User speaks → MediaRecorder captures audio
            → SpeechRecognition checks for stop/cancel phrases (interim results used here only)
User says stop phrase → audio blob sent to /api/transcribe
                      → server returns final text
                      → onTranscription("[voice] " + text) → onSend() → message sent
```

The user never sees what they're saying until the message appears in the chat as a sent message.

---

## Proposed Approach

### Core Idea

Surface the interim SpeechRecognition transcript into the textarea in real-time while recording, giving visual feedback of what's being recognized.

### Implementation

**1. Add `interimTranscript` to useVoiceInput return value**

In the `onresult` handler (stop mode), after checking for stop/cancel phrases, accumulate the current transcript and expose it:

```ts
// New state in useVoiceInput
const [interimTranscript, setInterimTranscript] = useState('');

// In onresult handler (stop mode), after phrase checks:
// Build full transcript from all results
let full = '';
for (let i = 0; i < event.results.length; i++) {
  full += event.results[i][0].transcript;
}
setInterimTranscript(full);

// Clear on stop/discard/transcribe
setInterimTranscript('');
```

Return `interimTranscript` from the hook.

**2. Display interim text in InputBar textarea**

Since the textarea is uncontrolled, write directly to the DOM:

```ts
useEffect(() => {
  if (voiceState === 'recording' && interimTranscript && inputRef.current) {
    inputRef.current.value = interimTranscript;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px';
  }
}, [interimTranscript, voiceState]);
```

**3. Clear on completion**

When recording stops (transcribing/idle), clear the textarea since the final server transcription will be sent directly via `onSend`. The interim preview was just a visual aid.

**4. Optional enhancement: keep interim text for editing**

Instead of auto-sending after transcription, populate the textarea with the final server transcription and let the user review/edit before sending. This would change the `onTranscription` callback to set textarea value instead of calling `onSend`. This is a UX decision worth discussing separately.

---

## Files That Need Changes

| File | Change |
|---|---|
| `src/features/voice/useVoiceInput.ts` | Add `interimTranscript` state, update `onresult` to set it, clear on stop/discard, return it |
| `src/features/chat/InputBar.tsx` | Destructure `interimTranscript` from hook, add `useEffect` to write it to textarea DOM |

Two files. No new files needed.

---

## Edge Cases and Concerns

### Interim vs Final Mismatch
Web Speech API interim results are rough approximations. The final server-side transcription (Whisper) will often differ significantly, especially for non-English languages. Users may be confused when the preview says one thing and the sent message says another.

**Mitigation:** Style the preview text differently (e.g., italic, muted color, or a subtle overlay label like "transcribing...") to signal it's provisional. Or: use the "edit before send" enhancement above.

### User Typing During Recording
If the user types in the textarea while recording, the interim transcript writes will overwrite their typed text.

**Mitigation:** Either disable the textarea during recording (already visually indicated), or only write interim text if the user hasn't manually typed (track a `userTypedDuringRecording` flag).

### IME Conflicts
The InputBar already guards against IME composition events. Interim transcript writes to `.value` during an active IME session could cause issues, but this is unlikely since typing and voice recording shouldn't overlap.

### Rapid State Updates
SpeechRecognition fires `onresult` frequently. Setting React state on every interim result could cause excessive re-renders.

**Mitigation:** Use a ref + requestAnimationFrame to throttle DOM writes, or use a ref for the transcript and only trigger a re-render on significant changes. Since we're writing to an uncontrolled textarea via ref, we can skip React state entirely and just write to `inputRef.current.value` via a callback.

### Stop/Cancel Phrase Leaking into Preview
The interim transcript will show "send it" or "boom" briefly before the phrase is detected and recording stops.

**Mitigation:** Apply the same `stopPhrasesRegex` cleanup to the displayed interim text, or accept the brief flash as negligible.

### Clearing on Submit
When the final transcription triggers `onSend`, the textarea is already cleared by `handleSend`. No special handling needed.

### Multi-language Recognition Quality
Web Speech API interim results vary wildly by language and browser. Some languages may produce garbled interim text.

**Mitigation:** Consider a per-language quality threshold, or just accept that preview quality will vary.

---

## Feasibility

**Fully feasible with the current architecture.** No refactoring needed.

The key enabler is that the SpeechRecognition instance already runs with `interimResults: true` during recording (stop mode). The transcript data is already available in the `onresult` handler — it just needs to be surfaced rather than discarded after phrase matching.

The uncontrolled textarea pattern actually makes this easier: we can write to the DOM directly without needing to convert to a controlled input.

---

## Estimated Complexity: **Small**

- ~20 lines in `useVoiceInput.ts` (add state, set in onresult, clear on transitions)
- ~10 lines in `InputBar.tsx` (useEffect to sync to textarea)
- Optional: ~10 lines for visual styling of preview text
- Minor API addition: useVoiceInput now includes interimTranscript. No new dependencies or architectural shifts
- ~1-2 hours implementation + testing across browsers
