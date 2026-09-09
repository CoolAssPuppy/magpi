import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';
import type { DreamOutputView } from '@/lib/dreams/queries';

import { DreamOutput } from './dream-output';

const getCited = (): DreamOutputView => ({
  kind: 'cited',
  documentId: 'doc-1',
  title: 'Engineering digest, 9 September',
  body: 'Billing slipped a week.',
  sources: [
    {
      index: 1,
      chunkId: 'chunk-a',
      documentId: 'doc-source',
      documentTitle: 'Linear: billing migration',
      excerpt: 'Moving the billing migration to the week of the 16th.',
    },
  ],
});

const onDelete = () => vi.fn().mockResolvedValue(successState(undefined));

describe('a dream output', () => {
  it('renders the synthesis with its references and names every source', () => {
    render(<DreamOutput output={getCited()} onDelete={onDelete()} />);

    expect(screen.getByText(/billing slipped a week/i)).toBeInTheDocument();
    expect(screen.getByText('Linear: billing migration')).toBeInTheDocument();
  });

  it('says a run produced nothing when its output cites no source', () => {
    render(
      <DreamOutput
        output={{
          kind: 'unsourced',
          documentId: 'doc-1',
          title: 'Engineering digest',
          reason: 'no-citations',
        }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.getByText(/produced nothing/i)).toBeInTheDocument();
  });

  it('says the sources are gone rather than blaming the run that wrote them', () => {
    render(
      <DreamOutput
        output={{
          kind: 'unsourced',
          documentId: 'doc-1',
          title: 'Engineering digest',
          reason: 'sources-unreadable',
        }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.getByText(/no longer be read/i)).toBeInTheDocument();
  });

  it('shows no synthesis at all when there is nothing to back it up', () => {
    render(
      <DreamOutput
        output={{
          kind: 'unsourced',
          documentId: 'doc-1',
          title: 'Engineering digest',
          reason: 'sources-unreadable',
        }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.queryByText(/billing slipped/i)).not.toBeInTheDocument();
  });

  it('says plainly when a run wrote no document', () => {
    render(<DreamOutput output={{ kind: 'none' }} onDelete={onDelete()} />);

    expect(screen.getByText(/wrote no document/i)).toBeInTheDocument();
  });

  it('says what deleting the output does to the sources before it happens', async () => {
    const remove = onDelete();
    render(<DreamOutput output={getCited()} onDelete={remove} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this document/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/documents it was written from are not/i)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    expect(remove).toHaveBeenCalledWith('doc-1');
  });

  it('reports a refused delete rather than hiding it', async () => {
    const remove = vi
      .fn()
      .mockResolvedValue({ status: 'error', message: 'Only a dream document can be deleted.' });
    render(<DreamOutput output={getCited()} onDelete={remove} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this document/i }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only a dream document can be deleted.',
    );
  });
});
