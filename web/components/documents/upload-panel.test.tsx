import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { UseSupabaseUploadOptions } from '@/hooks/use-supabase-upload';
import type { SpaceOption } from '@/lib/spaces/spaces';

const PERSONAL_ID = '33333333-3333-4333-8333-333333333333';
const ENGINEERING_ID = '44444444-4444-4444-8444-444444444444';
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';

const SPACES: readonly SpaceOption[] = [
  { id: PERSONAL_ID, name: 'Personal', kind: 'personal' },
  { id: ENGINEERING_ID, name: 'Engineering', kind: 'team' },
];

type EnqueueInput = {
  spaceId: string;
  objectName: string;
  title: string;
  mimeType: string;
};

const uploaded = (name: string, type: string) =>
  Object.assign(new File([new Uint8Array(10)], name, { type }), {
    preview: `blob:${name}`,
    errors: [],
  });

const hookState = {
  options: null as UseSupabaseUploadOptions | null,
  successes: [] as string[],
  files: [] as ReturnType<typeof uploaded>[],
};

const actionState = {
  calls: [] as EnqueueInput[],
  result: { status: 'success', data: { documentId: DOCUMENT_ID } } as ActionState<{
    documentId: string;
  }>,
};

vi.mock('@/app/(app)/documents/actions', () => ({
  enqueueUploadedDocument: async (input: EnqueueInput) => {
    actionState.calls.push(input);
    return actionState.result;
  },
}));

// The real react-dropzone state, so the panel renders its actual drop area and
// the limits it sets are readable on screen. Only what an upload produces is
// controlled here.
vi.mock('@/hooks/use-supabase-upload', async () => {
  const { useDropzone } = await import('react-dropzone');

  return {
    useSupabaseUpload: (options: UseSupabaseUploadOptions) => {
      hookState.options = options;
      const dropzone = useDropzone({ noClick: true });

      return {
        ...dropzone,
        files: hookState.files,
        setFiles: () => {},
        successes: hookState.successes,
        isSuccess: false,
        loading: false,
        errors: [],
        setErrors: () => {},
        onUpload: async () => {},
        maxFileSize: options.maxFileSize ?? Number.POSITIVE_INFINITY,
        maxFiles: options.maxFiles ?? 1,
        allowedMimeTypes: options.allowedMimeTypes ?? [],
      };
    },
  };
});

const { UploadPanel } = await import('./upload-panel');

const user = userEvent.setup({ delay: null });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  // A Radix select measures and captures the pointer. jsdom does neither.
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  hookState.options = null;
  hookState.successes = [];
  hookState.files = [];
  actionState.calls = [];
  actionState.result = { status: 'success', data: { documentId: DOCUMENT_ID } };
});

async function chooseSpace(name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Put these in' }));
  await user.click(await screen.findByRole('option', { name }));
}

type Dropped = { readonly name: string; readonly type: string };

function renderPanel(spaces: readonly SpaceOption[] = SPACES) {
  const view = render(<UploadPanel spaces={spaces} />);
  const show = () => view.rerender(<UploadPanel spaces={spaces} />);

  return {
    show,
    /** Files in the drop area, then the button, the way a person does it. */
    async begin(dropped: readonly Dropped[]) {
      hookState.files = dropped.map((file) => uploaded(file.name, file.type));
      show();
      await user.click(screen.getByRole('button', { name: 'Upload files' }));
    },
    /**
     * What storage reports back once the objects are written. The real hook
     * only ever adds to this list, so a second upload of a name already in it
     * hands back the same names in a new array.
     */
    finish(names: string[]) {
      hookState.successes = names;
      show();
    },
  };
}

describe('choosing where an upload lands', () => {
  it('aims at the first space until someone picks another', () => {
    render(<UploadPanel spaces={SPACES} />);

    expect(screen.getByRole('combobox', { name: 'Put these in' })).toHaveTextContent('Personal');
    expect(hookState.options?.path).toBe(PERSONAL_ID);
  });

  it('offers every space the person can put a document in', async () => {
    render(<UploadPanel spaces={SPACES} />);

    await user.click(screen.getByRole('combobox', { name: 'Put these in' }));

    expect(await screen.findByRole('option', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Engineering' })).toBeInTheDocument();
  });

  it('tells the uploader the limits before they drop anything', () => {
    render(<UploadPanel spaces={SPACES} />);

    expect(screen.getByText('Upload 10 files')).toBeInTheDocument();
    // The panel caps a file at 50 MiB and the drop area counts in MB, so the
    // number a person reads is 52.43.
    expect(screen.getByText('Maximum file size: 52.43 MB')).toBeInTheDocument();
  });

  it('has nowhere to aim when the person is in no space at all', () => {
    render(<UploadPanel spaces={[]} />);

    expect(screen.getByRole('combobox', { name: 'Put these in' })).toHaveTextContent(
      'Choose a space',
    );
    expect(hookState.options?.path).toBe('');
  });
});

describe('what happens when a file finishes uploading', () => {
  it('sends the name and the space, and lets the server build the path', async () => {
    const panel = renderPanel();
    await chooseSpace('Engineering');

    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    panel.finish(['notes.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(1));
    expect(actionState.calls[0]).toEqual({
      spaceId: ENGINEERING_ID,
      objectName: 'notes.md',
      title: 'notes.md',
      mimeType: 'text/markdown',
    });
    // The storage policy reads that first segment back, so the object and the
    // record have to name the same space.
    expect(hookState.options?.path).toBe(ENGINEERING_ID);
  });

  // Browsers report an empty type for .md on several platforms, so trusting
  // file.type alone would refuse the format the product is mostly used for.
  it('works out the type from the name when the browser does not report one', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'notes.md', type: '' }]);
    panel.finish(['notes.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(1));
    expect(actionState.calls[0].mimeType).toBe('text/markdown');
  });

  it('says so on screen rather than queuing a file nothing can read', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'logo.png', type: 'image/png' }]);
    panel.finish(['logo.png']);

    expect(
      await screen.findByText('logo.png is not a kind of file that can be read.'),
    ).toBeVisible();
    expect(actionState.calls).toEqual([]);
  });

  it('files an upload once, and not again when the space is changed afterwards', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    panel.finish(['notes.md']);
    await waitFor(() => expect(actionState.calls).toHaveLength(1));

    await chooseSpace('Engineering');
    panel.show();

    await waitFor(() => expect(actionState.calls).toHaveLength(1));
  });

  // The object was written under the space that was selected when the upload
  // started, and the storage policy reads that first path segment back. A
  // record naming any other space describes an object that is not there.
  it('records the upload against the space it started in, not one picked mid-flight', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    await chooseSpace('Engineering');
    panel.finish(['notes.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(1));
    expect(actionState.calls[0].spaceId).toBe(PERSONAL_ID);
  });

  // The upload hook only ever adds to its list of successes, so a second upload
  // of a name already in it looks identical from the outside. Two different
  // spaces are two different objects and two different documents.
  it('files the same file name again when it is put into a second space', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    panel.finish(['notes.md']);
    await waitFor(() => expect(actionState.calls).toHaveLength(1));

    await chooseSpace('Engineering');
    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    panel.finish(['notes.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(2));
    expect(actionState.calls.map((call) => call.spaceId)).toEqual([PERSONAL_ID, ENGINEERING_ID]);
  });

  it('files each of several uploads, one record apiece', async () => {
    const panel = renderPanel();

    await panel.begin([
      { name: 'one.md', type: 'text/markdown' },
      { name: 'two.md', type: 'text/markdown' },
    ]);
    panel.finish(['one.md', 'two.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(2));
    expect(actionState.calls.map((call) => call.title)).toEqual(['one.md', 'two.md']);
  });

  it('refuses a file with no type and no extension to work one out from', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'archive', type: '' }]);
    panel.finish(['archive']);

    expect(
      await screen.findByText('archive is not a kind of file that can be read.'),
    ).toBeVisible();
    expect(actionState.calls).toEqual([]);
  });

  // The name survives in `successes` after the file itself has left the list,
  // so the extension is the only thing left to go on and it is enough.
  it('still works out the type for an object the file list no longer holds', async () => {
    const panel = renderPanel();

    panel.finish(['gone.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(1));
    expect(actionState.calls[0].mimeType).toBe('text/markdown');
  });

  it('shows the reason the server refused the upload rather than an upload that looks done', async () => {
    actionState.result = { status: 'error', message: 'The free plan holds 100 documents.' };
    const panel = renderPanel();

    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    panel.finish(['notes.md']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The free plan holds 100 documents.',
    );
  });

  it('says nothing about failure while nothing has failed', async () => {
    const panel = renderPanel();

    await panel.begin([{ name: 'notes.md', type: 'text/markdown' }]);
    panel.finish(['notes.md']);

    await waitFor(() => expect(actionState.calls).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
