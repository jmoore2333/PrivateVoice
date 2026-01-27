import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TextInput from './TextInput.svelte';

describe('TextInput', () => {
  it('renders with default label', () => {
    render(TextInput, { props: { value: '' } });
    expect(screen.getByText('Text to generate')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(TextInput, { props: { value: '', label: 'Custom Label' } });
    expect(screen.getByText('Custom Label')).toBeInTheDocument();
  });

  it('displays character count', () => {
    render(TextInput, { props: { value: 'Hello' } });
    expect(screen.getByText('5 characters')).toBeInTheDocument();
  });

  it('shows remaining when maxLength set', () => {
    render(TextInput, { props: { value: 'Hello', maxLength: 100 } });
    expect(screen.getByText('95 remaining')).toBeInTheDocument();
  });

  it('calls onInput when typing', async () => {
    const onInput = vi.fn();
    render(TextInput, { props: { value: '', onInput } });
    const textarea = screen.getByRole('textbox');
    await fireEvent.input(textarea, { target: { value: 'New text' } });
    expect(onInput).toHaveBeenCalledWith('New text');
  });

  it('renders with placeholder', () => {
    render(TextInput, { props: { value: '', placeholder: 'Type here...' } });
    expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
  });

  it('renders with default placeholder', () => {
    render(TextInput, { props: { value: '' } });
    expect(screen.getByPlaceholderText('Enter text here...')).toBeInTheDocument();
  });

  it('renders without label when not provided', () => {
    render(TextInput, { props: { value: '', label: '' } });
    expect(screen.queryByText('Text to generate')).not.toBeInTheDocument();
  });
});
