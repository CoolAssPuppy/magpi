import { expect, test } from '@playwright/test';

import { createConfirmedUser, deleteUser, serviceClient, signedInClient } from './fixtures';

/**
 * The single most important journey in the repo. Two people ask the same
 * question. One gets an answer sourced from a document in a space they are in.
 * The other gets an answer that does not include it, with no error and no
 * permission dialog. Same query, same index, different rows, because RLS ran
 * inside the vector search.
 *
 * It asks `public.search` to prove that, rather than reading `chunks` directly.
 * Reading the table proves RLS on the table, which is a weaker claim and the
 * one this file used to make while its own header claimed the stronger one.
 * `search` is `security invoker` precisely so the reader's policies apply
 * inside it, and that is the property worth a test.
 */

/**
 * A query vector. The content is found through the full text half of the hybrid
 * search rather than the vector half, because a chunk written here has no
 * embedding, so the value only has to be a well-formed vector. It is not the
 * zero vector: cosine distance is undefined for that.
 */
const QUERY_VECTOR = `[${['1', ...Array.from({ length: 1535 }, () => '0')].join(',')}]`;
test('two people in different spaces get different answers to the same question', async () => {
  const insider = await createConfirmedUser('insider');
  const outsider = await createConfirmedUser('outsider');
  const service = serviceClient();

  try {
    const { data: spaces } = await service
      .from('spaces')
      .select('id, org_id, kind, owner_user_id')
      .eq('owner_user_id', insider.userId)
      .eq('kind', 'personal');

    const insiderSpace = spaces?.[0];
    expect(insiderSpace, 'the signup trigger creates a personal space').toBeTruthy();
    if (!insiderSpace) return;

    const { data: document } = await service
      .from('documents')
      .insert({
        org_id: insiderSpace.org_id,
        space_id: insiderSpace.id,
        title: 'Leadership decision on the pricing change',
        origin: 'upload',
      })
      .select('id')
      .single();

    expect(document).toBeTruthy();
    if (!document) return;

    await service.from('chunks').insert({
      org_id: insiderSpace.org_id,
      space_id: insiderSpace.id,
      document_id: document.id,
      ordinal: 0,
      content: 'We decided to move the Team plan to twenty five dollars per seat.',
    });

    const asInsider = await signedInClient(insider.email, insider.password);
    const asOutsider = await signedInClient(outsider.email, outsider.password);

    const ask = (client: Awaited<ReturnType<typeof signedInClient>>) =>
      client.rpc('search', {
        query_embedding: QUERY_VECTOR,
        // Every term has to appear: websearch_to_tsquery ANDs them, and the
        // chunk below carries no embedding, so the lexical arm is the only one
        // that can reach it. In production the semantic arm carries a question
        // phrased any other way.
        query_text: 'Team plan seat',
        match_count: 12,
      });

    const insiderHits = await ask(asInsider);
    const outsiderHits = await ask(asOutsider);

    expect(insiderHits.error).toBeNull();
    expect(insiderHits.data?.map((hit: { document_id: string }) => hit.document_id)).toContain(
      document.id,
    );

    // No error, no permission dialog. The same question, answered from fewer
    // rows.
    expect(outsiderHits.error).toBeNull();
    expect(outsiderHits.data?.map((hit: { document_id: string }) => hit.document_id)).not.toContain(
      document.id,
    );

    // The table underneath tells the same story, which is what makes the search
    // result above a permission boundary rather than a ranking accident.
    const insiderRows = await asInsider.from('chunks').select('id').eq('document_id', document.id);
    const outsiderRows = await asOutsider
      .from('chunks')
      .select('id')
      .eq('document_id', document.id);

    expect(insiderRows.data).toHaveLength(1);
    expect(outsiderRows.error).toBeNull();
    expect(outsiderRows.data).toHaveLength(0);
  } finally {
    await deleteUser(insider.userId);
    await deleteUser(outsider.userId);
  }
});
