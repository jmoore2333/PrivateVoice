import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Header from './Header.svelte';

describe('Header', () => {
  const defaultProps = {
    currentMode: 'custom-voice' as const,
    modelId: '1.7b',
    status: 'ready' as const,
  };

  it('renders all three mode buttons', () => {
    render(Header, { props: defaultProps });
    expect(screen.getByText('Custom Voice')).toBeInTheDocument();
    expect(screen.getByText('Voice Clone')).toBeInTheDocument();
    expect(screen.getByText('Voice Design')).toBeInTheDocument();
  });

  it('highlights current mode', () => {
    const { container } = render(Header, { props: defaultProps });
    const customVoiceButton = screen.getByText('Custom Voice');
    // The active mode button should have the accent color class
    expect(customVoiceButton.className).toContain('bg-[var(--color-accent)]');
    // Other buttons should not have the accent background
    const voiceCloneButton = screen.getByText('Voice Clone');
    expect(voiceCloneButton.className).not.toContain('bg-[var(--color-accent)]');
  });

  it('highlights different mode when selected', () => {
    render(Header, { props: { ...defaultProps, currentMode: 'voice-clone' } });
    const customVoiceButton = screen.getByText('Custom Voice');
    const voiceCloneButton = screen.getByText('Voice Clone');
    expect(voiceCloneButton.className).toContain('bg-[var(--color-accent)]');
    expect(customVoiceButton.className).not.toContain('bg-[var(--color-accent)]');
  });

  it('shows model indicator', () => {
    render(Header, { props: defaultProps });
    expect(screen.getByText('1.7b')).toBeInTheDocument();
  });

  it('shows status badge', () => {
    render(Header, { props: defaultProps });
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });

  it('calls onModeChange when mode button clicked', async () => {
    const onModeChange = vi.fn();
    render(Header, { props: { ...defaultProps, onModeChange } });
    await fireEvent.click(screen.getByText('Voice Clone'));
    expect(onModeChange).toHaveBeenCalledWith('voice-clone');
  });

  it('shows generating status with elapsed time', () => {
    render(Header, {
      props: { ...defaultProps, status: 'generating', statusDetail: '12.3s' }
    });
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    expect(screen.getByText(/12.3s/)).toBeInTheDocument();
  });
});
