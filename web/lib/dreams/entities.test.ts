import { describe, expect, it } from 'vitest';

import { buildEntityGroups } from './entities';
import type { EntityMentionRecord, EntityRecord, MentionedDocument } from './entities';

const getEntity = (overrides?: Partial<EntityRecord>): EntityRecord => ({
  id: 'entity-1',
  kind: 'project',
  name: 'SSO rollout',
  summary: 'The single sign-on work for enterprise customers.',
  space_id: 'space-1',
  ...overrides,
});

const getMention = (overrides?: Partial<EntityMentionRecord>): EntityMentionRecord => ({
  entity_id: 'entity-1',
  document_id: 'doc-a',
  ...overrides,
});

const getDocument = (overrides?: Partial<MentionedDocument>): MentionedDocument => ({
  id: 'doc-a',
  title: 'SSO rollout',
  url: 'https://linear.app/issue/1',
  ...overrides,
});

describe('entity groups', () => {
  it('groups entities under the kind they belong to', () => {
    const groups = buildEntityGroups({
      entities: [getEntity(), getEntity({ id: 'entity-2', kind: 'person', name: 'Ana' })],
      mentions: [],
      documents: [],
    });

    expect(groups.map((group) => group.kind)).toEqual(['person', 'project']);
  });

  it('orders kinds the same way every time, so the page does not reshuffle between runs', () => {
    const groups = buildEntityGroups({
      entities: [
        getEntity({ id: 'e1', kind: 'decision', name: 'Ship in October' }),
        getEntity({ id: 'e2', kind: 'person', name: 'Ana' }),
        getEntity({ id: 'e3', kind: 'customer', name: 'Acme' }),
        getEntity({ id: 'e4', kind: 'project', name: 'SSO' }),
      ],
      mentions: [],
      documents: [],
    });

    expect(groups.map((group) => group.kind)).toEqual([
      'person',
      'project',
      'customer',
      'decision',
    ]);
  });

  it('leaves out a kind nothing was extracted for', () => {
    const groups = buildEntityGroups({
      entities: [getEntity()],
      mentions: [],
      documents: [],
    });

    expect(groups).toHaveLength(1);
  });

  it('lists the documents an entity was mentioned in, which is the whole point', () => {
    const [group] = buildEntityGroups({
      entities: [getEntity()],
      mentions: [getMention(), getMention({ document_id: 'doc-b' })],
      documents: [getDocument(), getDocument({ id: 'doc-b', title: 'Notion: SSO spec' })],
    });

    expect(group.entities[0].documents.map((doc) => doc.title)).toEqual([
      'SSO rollout',
      'Notion: SSO spec',
    ]);
  });

  it('counts a document once however many chunks of it mention the entity', () => {
    const [group] = buildEntityGroups({
      entities: [getEntity()],
      mentions: [getMention(), getMention()],
      documents: [getDocument()],
    });

    expect(group.entities[0].documents).toHaveLength(1);
  });

  it('drops a mention of a document the caller cannot see', () => {
    const [group] = buildEntityGroups({
      entities: [getEntity()],
      mentions: [getMention({ document_id: 'doc-hidden' })],
      documents: [getDocument()],
    });

    expect(group.entities[0].documents).toEqual([]);
  });

  it('keeps an entity whose documents are all invisible, and says so through an empty list', () => {
    const [group] = buildEntityGroups({
      entities: [getEntity()],
      mentions: [getMention({ document_id: 'doc-hidden' })],
      documents: [],
    });

    expect(group.entities).toHaveLength(1);
    expect(group.entities[0].documents).toEqual([]);
  });

  it('sorts entities within a kind by name', () => {
    const [group] = buildEntityGroups({
      entities: [
        getEntity({ id: 'e1', name: 'Zed migration' }),
        getEntity({ id: 'e2', name: 'Billing' }),
      ],
      mentions: [],
      documents: [],
    });

    expect(group.entities.map((entity) => entity.name)).toEqual(['Billing', 'Zed migration']);
  });
});
