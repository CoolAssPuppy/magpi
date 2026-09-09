import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Composer } from './composer';

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onAsk = vi.fn();
  render(<Composer onAsk={onAsk} busy={false} placeholder="Ask anything" {...overrides} />);
  return { onAsk, field: screen.getByLabelText('Ask a question') };
}

describe('Composer', () => {
  it('asks the question on Enter and clears the field', async () => {
    const { onAsk, field } = renderComposer();

    await user.type(field, 'What is blocking SSO?{Enter}');

    expect(onAsk).toHaveBeenCalledWith('What is blocking SSO?');
    expect(field).toHaveValue('');
  });

  it('keeps writing on Shift and Enter', async () => {
    const { onAsk, field } = renderComposer();

    await user.type(field, 'first line{Shift>}{Enter}{/Shift}second line');

    expect(onAsk).not.toHaveBeenCalled();
    expect(field).toHaveValue('first line\nsecond line');
  });

  it('will not ask an empty question', async () => {
    const { onAsk, field } = renderComposer();

    await user.type(field, '   {Enter}');

    expect(onAsk).not.toHaveBeenCalled();
  });

  it('refuses a second question while one is being answered', async () => {
    const { onAsk, field } = renderComposer({ busy: true });

    await user.type(field, 'another question{Enter}');

    expect(onAsk).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('asks from the button as well as the keyboard', async () => {
    const { onAsk, field } = renderComposer();

    await user.type(field, 'What is blocking SSO?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(onAsk).toHaveBeenCalledWith('What is blocking SSO?');
  });
});
