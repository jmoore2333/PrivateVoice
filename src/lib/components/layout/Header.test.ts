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
