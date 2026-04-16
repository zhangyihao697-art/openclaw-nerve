import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InputBar } from './InputBar';

vi.mock('@/features/voice/useVoiceInput', () => ({
  useVoiceInput: () => ({
    voiceState: 'idle',
    interimTranscript: '',
    wakeWordEnabled: false,
    toggleWakeWord: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTabCompletion', () => ({
  useTabCompletion: () => ({
    handleKeyDown: () => false,
    reset: vi.fn(),
  }),
}));

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    sessions: [],
    currentSession: 'agent:main:main',
    agentName: 'Skirk',
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    liveTranscriptionPreview: false,
    sttInputMode: 'local',
    sttProvider: 'local',
  }),
}));

vi.mock('./image-compress', () => ({
  compressImage: vi.fn(),
}));

describe('InputBar ArrowUp behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves caret to start on single-line input before recalling history', () => {
    localStorage.setItem('nerve-input-history', JSON.stringify(['previous command']));
    render(<InputBar onSend={vi.fn()} isGenerating={false} />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    input.value = 'current draft';
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(input.value).toBe('current draft');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(0);
  });

  it('recalls history when caret is already at start on single-line input', () => {
    localStorage.setItem('nerve-input-history', JSON.stringify(['previous command']));
    render(<InputBar onSend={vi.fn()} isGenerating={false} />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    input.value = 'current draft';
    input.setSelectionRange(0, 0);

    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(input.value).toBe('previous command');
  });

  it('keeps native behavior for multi-line input', () => {
    localStorage.setItem('nerve-input-history', JSON.stringify(['previous command']));
    render(<InputBar onSend={vi.fn()} isGenerating={false} />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    input.value = 'line 1\nline 2';
    input.setSelectionRange(input.value.length, input.value.length);
    const beforeCaret = input.selectionStart;

    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(input.value).toBe('line 1\nline 2');
    expect(input.selectionStart).toBe(beforeCaret);
  });
});
