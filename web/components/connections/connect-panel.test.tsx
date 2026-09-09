import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
      { id: 'C1', name: 'general', url: null },
      { id: 'C2', name: 'engineering', url: null },
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
  onSaveScope: vi.fn().mockResolvedValue(successState(undefined)),
});

describe('the connect screen', () => {
  it('puts the space a connection binds to on the same screen as the choice of what it reads', () => {
    render(<ConnectPanel {...getProps()} connections={[getConnectionScope()]} />);

    expect(screen.getByLabelText(/space/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'general' })).toBeInTheDocument();
  });

  it('starts the connection in the space a person picked', async () => {
    const props = getProps();
    render(<ConnectPanel {...props} />);

    await userEvent.selectOptions(screen.getByLabelText(/space/i), 'space-2');
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

  it('reports a refused save rather than leaving a changed tick box looking saved', async () => {
    const props = getProps();
    props.onSaveScope.mockResolvedValue({
      status: 'error',
      message: 'That channel is no longer shared with Recall.',
    });
    render(<ConnectPanel {...props} connections={[getConnectionScope()]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'engineering' }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That channel is no longer shared with Recall.',
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

    const existing = screen.getByRole('region', { name: /what recall reads/i });
    expect(within(existing).getByText('Access expired')).toBeInTheDocument();
    expect(
      within(existing).getByText('The access token expired and could not be refreshed.'),
    ).toBeInTheDocument();
  });

  it('says there is nothing to configure yet on a first connection', () => {
    render(<ConnectPanel {...getProps()} />);

    expect(screen.getByText(/no connection to slack yet/i)).toBeInTheDocument();
  });
});
