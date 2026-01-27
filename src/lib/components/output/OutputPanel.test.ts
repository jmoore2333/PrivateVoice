import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OutputPanel from './OutputPanel.svelte';

describe('OutputPanel', () => {
  it('shows empty state when no audio', () => {
    render(OutputPanel, { props: {} });
    expect(screen.getByText(/generate audio to preview/i)).toBeInTheDocument();
  });

  it('shows generating state with elapsed time', () => {
    render(OutputPanel, {
      props: {
        isGenerating: true,
        elapsedTime: 5.2,
        generatingText: 'Hello world'
      }
    });
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    expect(screen.getByText('5.2s')).toBeInTheDocument();
  });

  it('shows action buttons when audio available', () => {
    render(OutputPanel, {
      props: { audioUrl: 'blob:test' }
    });
    expect(screen.getByText('Regenerate')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('shows contextual suggestion when provided', () => {
    render(OutputPanel, {
      props: {
        audioUrl: 'blob:test',
        suggestion: {
          message: 'Save as clonable voice?',
          action: vi.fn(),
          actionLabel: 'Save'
        }
      }
    });
    expect(screen.getByText(/save as clonable voice/i)).toBeInTheDocument();
  });
});
