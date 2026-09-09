import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ColumnChart, type ColumnPoint } from './column-chart';
import { LatencyChart, type LatencyPoint } from './latency-chart';
import { Meter, meterSeverity } from './meter';
import { RankedBars, type RankedItem } from './ranked-bars';

function columnPoint(overrides?: Partial<ColumnPoint>): ColumnPoint {
  return { label: 'Sep 9', caption: '9 September 2026', value: 12, ...overrides };
}

function latencyPoint(overrides?: Partial<LatencyPoint>): LatencyPoint {
  return { label: 'Sep 9', caption: '9 September 2026', p50Ms: 400, p95Ms: 1200, ...overrides };
}

function rankedItem(overrides?: Partial<RankedItem>): RankedItem {
  return { id: 'q1', label: 'Where is the runbook?', value: 12, ...overrides };
}

describe('column chart', () => {
  it('names what is plotted and labels the busiest day', () => {
    render(
      <ColumnChart
        title="Questions per day"
        description="Last 7 days"
        unitLabel="questions"
        points={[columnPoint({ value: 4 }), columnPoint({ label: 'Sep 10', value: 19 })]}
      />,
    );

    const plot = screen.getByRole('img', { name: /Questions per day/ });
    expect(screen.getByRole('heading', { name: 'Questions per day' })).toBeInTheDocument();
    expect(within(plot).getByText('19')).toBeInTheDocument();
  });

  it('carries a table of the same numbers, so no value is only in a tooltip', () => {
    render(
      <ColumnChart
        title="Questions per day"
        description="Last 7 days"
        unitLabel="questions"
        points={[columnPoint({ caption: '9 September 2026', value: 4 })]}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText('9 September 2026')).toBeInTheDocument();
    expect(within(table).getByText('4')).toBeInTheDocument();
  });

  it('draws a week with no traffic without inventing an axis', () => {
    render(
      <ColumnChart
        title="Questions per day"
        description="Last 7 days"
        unitLabel="questions"
        points={[columnPoint({ value: 0 }), columnPoint({ label: 'Sep 10', value: 0 })]}
      />,
    );

    expect(screen.getByRole('img', { name: /Questions per day/ })).toBeInTheDocument();
  });
});

describe('latency chart', () => {
  it('legends both series, because color alone is not identity', () => {
    render(
      <LatencyChart title="Answer latency" description="Last 7 days" points={[latencyPoint()]} />,
    );

    const legend = screen.getByRole('list', { name: 'Series' });
    expect(within(legend).getByText('p50')).toBeInTheDocument();
    expect(within(legend).getByText('p95')).toBeInTheDocument();
  });

  it('labels the most recent p95 directly', () => {
    render(
      <LatencyChart
        title="Answer latency"
        description="Last 7 days"
        points={[latencyPoint({ p95Ms: 900 }), latencyPoint({ label: 'Sep 10', p95Ms: 1500 })]}
      />,
    );

    expect(screen.getAllByText('1,500 ms').length).toBeGreaterThan(0);
  });

  it('says so where a day has no answers rather than reading it as zero', () => {
    render(
      <LatencyChart
        title="Answer latency"
        description="Last 7 days"
        points={[latencyPoint({ p50Ms: null, p95Ms: null })]}
      />,
    );

    expect(screen.getAllByText('no answers').length).toBeGreaterThan(0);
  });
});

describe('ranked bars', () => {
  it('lists each item with its count', () => {
    render(
      <RankedBars
        valueLabel="times asked"
        items={[rankedItem(), rankedItem({ id: 'q2', label: 'How do I rotate a key?', value: 3 })]}
      />,
    );

    expect(screen.getByText('Where is the runbook?')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('gives every bar the same color, since the categories have no order', () => {
    const { container } = render(
      <RankedBars
        valueLabel="times asked"
        items={[rankedItem({ value: 12 }), rankedItem({ id: 'q2', value: 3 })]}
      />,
    );

    const fills = [...container.querySelectorAll<HTMLElement>('[style*="background-color"]')];
    expect(fills).toHaveLength(2);
    expect(new Set(fills.map((fill) => fill.style.backgroundColor)).size).toBe(1);
    expect(fills[1].style.width).toBe('25%');
  });
});

describe('meter', () => {
  it('reads out its value and its limit', () => {
    render(<Meter label="Documents" used={88} limit={200} unit="documents" />);

    const meter = screen.getByRole('meter', { name: 'Documents' });
    expect(meter).toHaveAttribute('aria-valuenow', '88');
    expect(meter).toHaveAttribute('aria-valuemax', '200');
  });

  it('says the state in words as well as in color', () => {
    render(<Meter label="Documents" used={190} limit={200} unit="documents" />);

    expect(screen.getByText('Near the limit')).toBeInTheDocument();
  });

  it('stays quiet while there is room', () => {
    render(<Meter label="Documents" used={10} limit={200} unit="documents" />);

    expect(screen.queryByText('Near the limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Over the limit')).not.toBeInTheDocument();
  });

  it('leaves out the track where there is no limit to measure against', () => {
    render(<Meter label="Storage stored" used={1_400_000_000} limit={null} unit="bytes" />);

    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText('1,400,000,000')).toBeInTheDocument();
  });

  it('formats its value the way the caller asks', () => {
    render(
      <Meter
        label="Storage stored"
        used={1_400_000_000}
        limit={null}
        unit="bytes"
        formatValue={(value) => `${value / 1e9} GB`}
      />,
    );

    expect(screen.getByText('1.4 GB')).toBeInTheDocument();
  });

  it('grades severity by how much of the plan is spent', () => {
    expect(meterSeverity(10, 200)).toBe('within');
    expect(meterSeverity(160, 200)).toBe('near');
    expect(meterSeverity(200, 200)).toBe('over');
    expect(meterSeverity(5, null)).toBe('within');
  });
});
