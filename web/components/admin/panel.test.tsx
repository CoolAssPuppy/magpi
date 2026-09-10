import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Panel } from './panel';
import { PanelSkeleton } from './panel-skeleton';

describe('an analytics panel', () => {
  it('gives the panel a heading, so the page reads as a list of sections', () => {
    render(
      <Panel title="Ingest health">
        <p>Nothing has failed today.</p>
      </Panel>,
    );

    expect(screen.getByRole('heading', { name: 'Ingest health', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Nothing has failed today.')).toBeInTheDocument();
  });

  // A panel used to take a subtitle. Every one of them restated its own heading, so the heading
  // is the whole story and anything else belongs in the panel's content.
  it('draws no rule, so a page of panels is separated by space rather than by lines', () => {
    const { container } = render(
      <Panel title="Dead content">
        <p>48 of 100</p>
      </Panel>,
    );

    const section = container.querySelector('section');
    expect(section?.className ?? '').not.toMatch(/border/);
  });

  it('says nothing extra when the heading is the whole story', () => {
    const { container } = render(
      <Panel title="Plan usage">
        <p>3 of 5 seats</p>
      </Panel>,
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('carries a control of its own, such as the range the panel is filtered to', () => {
    render(
      <Panel title="Answer latency" action={<button type="button">Last 30 days</button>}>
        <p>1.4s median</p>
      </Panel>,
    );

    expect(screen.getByRole('button', { name: 'Last 30 days' })).toBeInTheDocument();
  });
});

describe('a panel waiting on its query', () => {
  it('stays out of the accessibility tree, so nobody is read rows of nothing', () => {
    const { container } = render(<PanelSkeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
