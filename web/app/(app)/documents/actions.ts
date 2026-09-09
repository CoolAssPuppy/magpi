'use server';

import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { ACCEPTED_MIME_TYPES, storagePathFor } from '@/lib/documents/uploads';
import { withSession } from '@/lib/actions/with-session';
import { createServiceClient } from '@/lib/supabase/service';

const enqueueSchema = z.object({
  spaceId: z.uuid(),
  // The name of the object inside the space's own folder, not a path. The
  // caller used to send the whole path, which the service client wrote and the
  // ingest worker read back with no space check of its own, so naming another
  // space's object had that object indexed and quoted into a space the caller
  // could see. A slash is refused rather than stripped: a name containing one
  // did not come from the dropzone.
  objectName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => !name.includes('/'), 'the object name is a name, not a path'),
  title: z.string().trim().min(1).max(500),
  mimeType: z.enum(ACCEPTED_MIME_TYPES),
});

/**
 * Records an uploaded object as a document and queues it for reading.
 *
 * The plan check runs in the database, not here. A client that skipped this
 * action entirely still cannot get past `check_ingest_allowed`.
 */
export async function enqueueUploadedDocument(
  input: z.input<typeof enqueueSchema>,
): Promise<ActionState<{ documentId: string }>> {
  return withSession(async ({ supabase, orgId }) => {
    const parsed = enqueueSchema.safeParse(input);
    if (!parsed.success) return errorState('That upload could not be recorded.');

    const { spaceId, objectName, title, mimeType } = parsed.data;

    // The caller's own client, so RLS proves they are in this space before the
    // service role touches anything.
    const { data: space } = await supabase
      .from('spaces')
      .select('id')
      .eq('id', spaceId)
      .maybeSingle();
    if (!space) return errorState('You are not in that space.');

    const { data: allowance, error: allowanceError } = await supabase
      .rpc('check_ingest_allowed', { p_org_id: orgId })
      .single();

    if (allowanceError) return errorState(allowanceError.message);
    if (!allowance.allowed) return errorState(allowance.reason ?? 'This plan is full.');

    const service = createServiceClient();

    const { data: document, error: documentError } = await service
      .from('documents')
      .insert({
        org_id: orgId,
        space_id: spaceId,
        title,
        mime_type: mimeType,
        storage_path: storagePathFor(spaceId, objectName),
        origin: 'upload',
      })
      .select('id')
      .single();

    if (documentError) return errorState(documentError.message);

    const { error: jobError } = await service.from('ingest_jobs').insert({
      org_id: orgId,
      space_id: spaceId,
      document_id: document.id,
      stage: 'extract',
    });

    if (jobError) return errorState(jobError.message);

    await service
      .from('usage_events')
      .insert({ org_id: orgId, kind: 'document_ingested', quantity: 1 });

    return successState({ documentId: document.id });
  }, '/documents');
}

const deleteSchema = z.object({ documentId: z.uuid() });

/** Only a dream output is deletable from the UI, and deleting it leaves its sources alone. */
export async function deleteDreamDocument(formData: FormData): Promise<ActionState<undefined>> {
  return withSession(async ({ supabase }) => {
    const parsed = deleteSchema.safeParse({ documentId: formData.get('documentId') });
    if (!parsed.success) return errorState('That document could not be deleted.');

    const { error } = await supabase.from('documents').delete().eq('id', parsed.data.documentId);
    if (error) return errorState(error.message);

    return successState(undefined);
  }, '/documents');
}
