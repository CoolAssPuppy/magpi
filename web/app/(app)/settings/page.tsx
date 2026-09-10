import { redirect } from 'next/navigation';

import { ActionButton } from '@/components/admin/action-button';
import { Panel } from '@/components/admin/panel';
import { PageHeader } from '@/components/app/page-header';
import { getSessionContext } from '@/lib/supabase/context';

import { renamePersonalSpace, signOutEverywhere, updateDisplayName } from './actions';
import { NameForm } from './name-form';

export default async function SettingsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const [{ data: userData }, { data: personalSpace }] = await Promise.all([
    context.supabase.auth.getUser(),
    context.supabase
      .from('spaces')
      .select('id, name')
      .eq('org_id', context.orgId)
      .eq('kind', 'personal')
      .eq('owner_user_id', context.userId)
      .maybeSingle(),
  ]);

  const displayName =
    typeof userData.user?.user_metadata.display_name === 'string'
      ? userData.user.user_metadata.display_name
      : '';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Your account and your personal space." />

      <Panel title="Profile">
        <p className="mb-4 text-sm text-tertiary-foreground">
          Signed in as {context.email ?? 'an unknown address'}.
        </p>
        <NameForm
          action={updateDisplayName}
          fieldName="displayName"
          label="Display name"
          defaultValue={displayName}
          placeholder="Ada Lovelace"
          submitLabel="Save"
          pendingLabel="Saving"
          savedLabel="Saved"
        />
      </Panel>

      <Panel title="Your personal space">
        {personalSpace ? (
          <NameForm
            action={renamePersonalSpace}
            fieldName="name"
            label="Space name"
            defaultValue={personalSpace.name}
            placeholder="Personal"
            submitLabel="Rename"
            pendingLabel="Renaming"
            savedLabel="Renamed"
          />
        ) : (
          <p className="text-sm text-tertiary-foreground">
            This account has no personal space, which should not be possible. Sign out and back in,
            and tell us if it is still missing.
          </p>
        )}
      </Panel>

      <Panel title="Sessions">
        <ActionButton
          action={signOutEverywhere}
          label="Sign out everywhere"
          pendingLabel="Signing out"
          variant="outline"
        />
      </Panel>
    </div>
  );
}
