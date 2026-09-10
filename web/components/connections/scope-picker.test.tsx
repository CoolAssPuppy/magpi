import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ScopeRoutes, ScopeSelection } from '@/lib/connections/scope-selection';

import { ScopePicker, type RoutableSpace } from './scope-picker';

const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';

const SPACES: readonly RoutableSpace[] = [
  { id: ENGINEERING, name: 'Engineering' },
  { id: FINANCE, name: 'Finance' },
];

const getSelection = (overrides?: Partial<Extract<ScopeSelection, { kind: 'set' }>>) =>
  ({
    kind: 'set',
    selectionKind: 'channel',
    available: [
      { id: 'C1', name: 'general' },
      { id: 'C2', name: 'engineering' },
      { id: 'C3', name: 'design' },
    ],
    routes: { C1: ENGINEERING },
    ...overrides,
  }) satisfies ScopeSelection;

const renderPicker = (props?: {
  selection?: ScopeSelection;
  routes?: ScopeRoutes;
  onChange?: (routes: ScopeRoutes) => void;
  disabled?: boolean;
}) =>
  render(
    <ScopePicker
      selection={props?.selection ?? getSelection()}
      routes={props?.routes ?? { C1: ENGINEERING }}
      spaces={SPACES}
      onChange={props?.onChange ?? vi.fn()}
      disabled={props?.disabled}
    />,
  );

const selectFor = (unitName: string) =>
  screen.getByRole('combobox', { name: `Space for ${unitName}` });

/** Radix keeps its options out of the DOM until the trigger opens, unlike a native select. */
const openSelectFor = async (unitName: string) => {
  await userEvent.click(selectFor(unitName));
  return screen.findByRole('listbox');
};

const chooseFor = async (unitName: string, optionName: string) => {
  await openSelectFor(unitName);
  await userEvent.click(await screen.findByRole('option', { name: optionName }));
};

describe('the scope picker', () => {
  it('lists what the source offered and shows where each unit already goes', () => {
    renderPicker();

    expect(selectFor('general')).toHaveTextContent('Engineering');
    expect(selectFor('engineering')).toHaveTextContent('Not routed');
    expect(selectFor('design')).toHaveTextContent('Not routed');
  });

  it('offers every space the reader is in, plus the option to route nowhere', async () => {
    renderPicker();
    await openSelectFor('general');

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Not routed', 'Engineering', 'Finance']);
  });

  it('routes a unit to the space a person picks', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    await chooseFor('engineering', 'Finance');

    expect(onChange).toHaveBeenCalledWith({ C1: ENGINEERING, C2: FINANCE });
  });

  // One authorized account, two destinations. This is the whole point of routing per unit.
  it('sends one channel to Engineering and another to Finance', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange, routes: { C1: ENGINEERING } });

    await chooseFor('design', 'Finance');

    expect(onChange).toHaveBeenCalledWith({ C1: ENGINEERING, C3: FINANCE });
  });

  it('moves a unit rather than adding a second destination for it', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    await chooseFor('general', 'Finance');

    expect(onChange).toHaveBeenCalledWith({ C1: FINANCE });
  });

  it('drops a unit from the routing rather than storing an empty destination', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange, routes: { C1: ENGINEERING, C2: FINANCE } });

    await chooseFor('general', 'Not routed');

    expect(onChange).toHaveBeenCalledWith({ C2: FINANCE });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('C1');
  });

  it('describes the routing as it stands, not as it was stored', () => {
    renderPicker({ routes: { C1: ENGINEERING, C2: FINANCE } });

    expect(screen.getByText('2 of 3 channels into 2 spaces')).toBeInTheDocument();
  });

  it('says what routing one channel would do when nothing is routed yet', () => {
    renderPicker({ routes: {} });

    expect(screen.getByText(/send a channel to a space/i)).toBeInTheDocument();
    expect(screen.getByText('No channels routed')).toBeInTheDocument();
  });

  it('explains itself rather than showing an empty list before the source has answered', () => {
    renderPicker({ selection: { kind: 'unset' }, routes: {} });

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByText(/has not listed/i)).toBeInTheDocument();
  });

  it('offers a whole-workspace source the same one destination per unit', () => {
    renderPicker({
      selection: {
        kind: 'set',
        selectionKind: 'workspace',
        available: [{ id: 'W1', name: 'Acme' }],
        routes: { W1: ENGINEERING },
      },
      routes: { W1: ENGINEERING },
    });

    expect(selectFor('Acme')).toHaveTextContent('Engineering');
    expect(screen.getByText('1 of 1 workspaces into 1 space')).toBeInTheDocument();
  });

  it('takes no routing changes while a save is running', () => {
    renderPicker({ disabled: true });

    expect(selectFor('general')).toBeDisabled();
  });
});
