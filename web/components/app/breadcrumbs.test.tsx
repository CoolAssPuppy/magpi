import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const route = { pathname: '/chat' };

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

const { Breadcrumbs, crumbsFor } = await import('./breadcrumbs');

const SPACE_ID = '8f14e45f-ceea-467a-9c1e-1b0b5f0f4c3d';

const trail = (pathname: string) => crumbsFor(pathname).map((crumb) => crumb.label);

describe('the breadcrumb trail', () => {
  it('names each section on the way down', () => {
    expect(trail('/admin/members')).toEqual(['Admin', 'Members']);
    expect(trail('/dreams/entities')).toEqual(['Dreams', 'Entities']);
  });

  it('calls a record by what it is, since an id names nothing to a reader', () => {
    expect(trail('/chat/9f1d2c3b-4a5e-4f60-8a71-2b3c4d5e6f70')).toEqual(['Chat', 'Conversation']);
    expect(trail('/documents/9f1d2c3b-4a5e-4f60-8a71-2b3c4d5e6f70')).toEqual([
      'Documents',
      'Document',
    ]);
  });

  it('reads a provider slug as its own name', () => {
    expect(trail('/connections/google-drive')).toEqual(['Connections', 'Google Drive']);
  });

  it('has nothing to show above the top level', () => {
    expect(crumbsFor('/')).toEqual([]);
  });

  it('links every crumb except the one the reader is on', () => {
    route.pathname = '/admin/members';
    render(<Breadcrumbs />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
    expect(screen.getByText('Members')).toHaveAttribute('aria-current', 'page');
  });
});

describe('a record crumb', () => {
  it('says what the record is called once the page has said so', () => {
    expect(crumbsFor(`/spaces/${SPACE_ID}`, 'Engineering').at(-1)?.label).toBe('Engineering');
  });

  // Before the page registers a title, and for a page that never does, the kind of thing it is.
  it('falls back to the kind of record when nothing named it', () => {
    expect(crumbsFor(`/spaces/${SPACE_ID}`).at(-1)?.label).toBe('Space');
  });

  it('does not rename a section that merely follows a record', () => {
    expect(crumbsFor('/dreams/entities', 'Some document').at(-1)?.label).toBe('Entities');
  });
});
