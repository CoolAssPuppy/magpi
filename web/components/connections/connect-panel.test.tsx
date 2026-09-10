import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';

import { ConnectPanel, type ConnectionScope } from './connect-panel';

const getProvider = () => ({
  slug: 'slack',
  displayName: 'Slack',
  description: 'Channels and threads.',
  docsUrl: 'https://api.slack.com',
  scopeSelectionKind: 'channel',
});

const getSpaces = () => [
  { id: 'space-1', name: 'Personal' },
  { id: 'space-2', name: 'Engineering' },
];

const getConnectionScope = (overrides?: Partial<ConnectionScope>): ConnectionScope => ({
  id: 'conn-1',
  spaceId: 'space-2',
  spaceName: 'Engineering',
  account: 'Acme',
  status: {
    status: 'active',
    label: 'Connected',
    tone: 'positive',
    reason: 'Reading on the usual schedule.',
    recovery: { kind: 'resync', label: 'Sync now' },
  },
  selection: {
    kind: 'set',
    selectionKind: 'channel',
    available: [
      { id: 'C1', name: 'general' },
      { id: 'C2', name: 'engineering' },
    ],
    selected: ['C1'],
  },
  ...overrides,
});

const getProps = () => ({
  provider: getProvider(),
  spaces: getSpaces(),
  connections: [],
  initialSpaceId: 'space-1',
  onBegin: vi.fn().mockResolvedValue(successState(undefined)),
  onSaveScope: vi.fn().mockResolvedValue(
    successState({
      kind: 'set',
      selectionKind: 'channel',
      available: [
        { id: 'C1', name: 'general' },
        { id: 'C2', name: 'engineering' },
      ],
      selected: ['C1', 'C2'],
    }),
  ),
});

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

describe('the connect screen', () => {
  it('puts the space a connection binds to on the same screen as the choice of what it reads', () => {
    render(<ConnectPanel {...getProps()} connections={[getConnectionScope()]} />);

    expect(screen.getByRole('combobox', { name: 'Space' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'general' })).toBeInTheDocument();
  });

  // One control for one decision, so the space picker is the shadcn Select.
  it('starts the connection in the space a person picked', async () => {
    const props = getProps();
    render(<ConnectPanel {...props} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Space' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Engineering' }));
    await userEvent.click(screen.getByRole('button', { name: /connect slack/i }));

    expect(props.onBegin).toHaveBeenCalledWith('space-2');
  });

  it('says what happens next rather than dropping the person into an unexplained redirect', () => {
    render(<ConnectPanel {...getProps()} />);

    expect(screen.getByText(/you will be sent to slack/i)).toBeInTheDocument();
  });

  it('saves a changed scope selection for the connection it belongs to', async () => {
    const props = getProps();
    render(<ConnectPanel {...props} connections={[getConnectionScope()]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'engineering' }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(props.onSaveScope).toHaveBeenCalledWith('conn-1', ['C1', 'C2']);
  });

  it('drops a tick the provider no longer offers, rather than showing it as saved', async () => {
    const props = getProps();
    props.onSaveScope.mockResolvedValue(
      successState({
        kind: 'set',
        selectionKind: 'channel',
        available: [{ id: 'C1', name: 'general' }],
        selected: ['C1'],
      }),
    );
    render(<ConnectPanel {...props} connections={[getConnectionScope()]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'engineering' }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'engineering' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'general' })).toBeChecked();
  });

  it('says what an empty selection does, because it differs by source', () => {
    const props = getProps();
    render(
      <ConnectPanel
        {...props}
        connections={[
          getConnectionScope({
            selection: {
              kind: 'set',
              selectionKind: 'channel',
              available: [{ id: 'C1', name: 'general' }],
              selected: [],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText(/reads nothing from this source/i)).toBeInTheDocument();
  });

  it('reports a refused save rather than leaving a changed tick box looking saved', async () => {
    const props = getProps();
    props.onSaveScope.mockResolvedValue({
      status: 'error',
      message: 'That channel is no longer shared with Magpi.',
    });
    render(<ConnectPanel {...props} connections={[getConnectionScope()]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'engineering' }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That channel is no longer shared with Magpi.',
    );
  });

  it('shows the status of a connection that has stopped working, next to its scope', () => {
    render(
      <ConnectPanel
        {...getProps()}
        connections={[
          getConnectionScope({
            status: {
              status: 'expired',
              label: 'Access expired',
              tone: 'warning',
              reason: 'The access token expired and could not be refreshed.',
              recovery: { kind: 'reconnect', label: 'Reconnect' },
            },
          }),
        ]}
      />,
    );

    const existing = screen.getByRole('region', { name: /what magpi reads/i });
    expect(within(existing).getByText('Access expired')).toBeInTheDocument();
    expect(
      within(existing).getByText('The access token expired and could not be refreshed.'),
    ).toBeInTheDocument();
  });

  it('leaves out the documentation link for a provider that has none', () => {
    const props = getProps();
    render(<ConnectPanel {...props} provider={{ ...getProvider(), docsUrl: null }} />);

    expect(screen.queryByRole('link', { name: /what slack gives magpi/i })).not.toBeInTheDocument();
  });

  it('offers no save button for a source that reads a whole workspace, since there is no choice', () => {
    render(
      <ConnectPanel
        {...getProps()}
        connections={[
          getConnectionScope({
            selection: {
              kind: 'set',
              selectionKind: 'workspace',
              available: [{ id: 'W1', name: 'Acme' }],
              selected: ['W1'],
            },
          }),
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: /save selection/i })).not.toBeInTheDocument();
    expect(screen.getByText(/the whole workspace/i)).toBeInTheDocument();
  });

  it('says there is nothing to configure yet on a first connection', () => {
    render(<ConnectPanel {...getProps()} />);

    expect(screen.getByText(/no connection to slack yet/i)).toBeInTheDocument();
  });
});
