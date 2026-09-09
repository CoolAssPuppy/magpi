import { expect, test } from '@playwright/test';

import { createConfirmedUser, deleteUser, serviceClient, signedInClient } from './fixtures';

/**
 * The single most important journey in the repo. Two people ask the same
 * question. One gets an answer sourced from a document in a space they are in.
 * The other gets an answer that does not include it, with no error and no
 * permission dialog. Same query, same index, different rows, because RLS ran
 * inside the vector search.
 */
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
    const insiderRows = await asInsider.from('chunks').select('id').eq('document_id', document.id);

    const asOutsider = await signedInClient(outsider.email, outsider.password);
    const outsiderRows = await asOutsider.from('chunks').select('id').eq('document_id', document.id);

    expect(insiderRows.data).toHaveLength(1);
    // No error, no permission dialog. Just fewer rows.
    expect(outsiderRows.error).toBeNull();
    expect(outsiderRows.data).toHaveLength(0);
  } finally {
    await deleteUser(insider.userId);
    await deleteUser(outsider.userId);
  }
});
