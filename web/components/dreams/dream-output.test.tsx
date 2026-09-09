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

  it('says a run produced nothing when it cited no source at all', () => {
    render(
      <DreamOutput
        output={{ kind: 'uncited', documentId: 'doc-1', title: 'Engineering digest' }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.getByText(/produced nothing/i)).toBeInTheDocument();
  });

  it('shows no synthesis at all when the run cited nothing to back it up', () => {
    render(
      <DreamOutput
        output={{ kind: 'uncited', documentId: 'doc-1', title: 'Engineering digest' }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.queryByText(/billing slipped/i)).not.toBeInTheDocument();
  });

  it('says the sources were deleted, and how many the run cited', () => {
    render(
      <DreamOutput
        output={{
          kind: 'sources-gone',
          documentId: 'doc-1',
          title: 'Engineering digest',
          body: 'Billing slipped a week.',
          citedCount: 4,
        }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.getByText(/4 sources this digest was built from/i)).toBeInTheDocument();
    expect(screen.getByText(/since been deleted or re-imported/i)).toBeInTheDocument();
  });

  it('still shows the text, so a digest whose evidence went away does not read as invented', () => {
    render(
      <DreamOutput
        output={{
          kind: 'sources-gone',
          documentId: 'doc-1',
          title: 'Engineering digest',
          body: 'Billing slipped a week.',
          citedCount: 4,
        }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.getByText(/billing slipped a week/i)).toBeInTheDocument();
  });

  it('never says the run produced nothing, which would be a lie about the run', () => {
    render(
      <DreamOutput
        output={{
          kind: 'sources-gone',
          documentId: 'doc-1',
          title: 'Engineering digest',
          body: 'Billing slipped a week.',
          citedCount: 4,
        }}
        onDelete={onDelete()}
      />,
    );

    expect(screen.queryByText(/produced nothing/i)).not.toBeInTheDocument();
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

  it('keeps the document when a person backs out of the dialog', async () => {
    const remove = onDelete();
    render(<DreamOutput output={getCited()} onDelete={remove} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this document/i }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /keep it/i }),
    );

    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
