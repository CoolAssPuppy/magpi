// Every email Magpi sends, and the one place their words live.
//
// Each one says what happened, what it wants, and what to do if it was not you. Nothing else:
// an account email is read in four seconds by somebody who is mid-task.

import * as React from 'react';

import { Action, Fallback, Heading, Paragraph, Shell } from './layout.tsx';

export interface Addressed {
  siteUrl: string;
  actionUrl: string;
}

/** The subject and the body, together, because a subject that drifts from its email is a bug. */
export interface Rendered {
  subject: string;
  body: React.ReactElement;
}

const NOT_YOU = 'If this was not you, ignore this email and nothing will change.';

export function confirmSignup({ siteUrl, actionUrl }: Addressed): Rendered {
  return {
    subject: 'Confirm your email address',
    body: (
      <Shell preview='One click and your Magpi account is ready.' siteUrl={siteUrl}>
        <Heading>Confirm your email address</Heading>
        <Paragraph>
          You are one click from a Magpi account. Confirm this address and you can start connecting
          the places your team already writes things down.
        </Paragraph>
        <Action href={actionUrl}>Confirm my email</Action>
        <Paragraph quiet>{NOT_YOU}</Paragraph>
        <Fallback href={actionUrl} />
      </Shell>
    ),
  };
}

export function resetPassword({ siteUrl, actionUrl }: Addressed): Rendered {
  return {
    subject: 'Reset your Magpi password',
    body: (
      <Shell preview='Pick a new password for Magpi.' siteUrl={siteUrl}>
        <Heading>Reset your password</Heading>
        <Paragraph>
          Somebody asked to reset the password on this account. The link works once, and for an
          hour.
        </Paragraph>
        <Action href={actionUrl}>Choose a new password</Action>
        <Paragraph quiet>
          {NOT_YOU} Your current password keeps working until you pick a new one.
        </Paragraph>
        <Fallback href={actionUrl} />
      </Shell>
    ),
  };
}

export function magicLink({ siteUrl, actionUrl }: Addressed): Rendered {
  return {
    subject: 'Your Magpi sign-in link',
    body: (
      <Shell preview='Sign in to Magpi without a password.' siteUrl={siteUrl}>
        <Heading>Sign in to Magpi</Heading>
        <Paragraph>This link signs you in on the device that opens it. It works once.</Paragraph>
        <Action href={actionUrl}>Sign me in</Action>
        <Paragraph quiet>{NOT_YOU}</Paragraph>
        <Fallback href={actionUrl} />
      </Shell>
    ),
  };
}

/**
 * Changing the address you sign in with. Both inboxes are asked, and the change only lands when
 * both have answered, so this email says which side the reader is on.
 */
export function changeEmail(
  { siteUrl, actionUrl }: Addressed,
  { newEmail, isNewAddress }: { newEmail: string; isNewAddress: boolean },
): Rendered {
  return {
    subject: 'Confirm the change to your Magpi email',
    body: (
      <Shell preview='Confirm the change to the address you sign in with.' siteUrl={siteUrl}>
        <Heading>Confirm your new email address</Heading>
        <Paragraph>
          {isNewAddress
            ? `Somebody asked to move a Magpi account to this address, ${newEmail}. Confirming here is one half of it.`
            : `Somebody asked to move this Magpi account to ${newEmail}. Approving here is one half of it.`}
        </Paragraph>
        <Paragraph>
          We asked both addresses. The change only takes effect once both have said yes, and until
          then you keep signing in with the old one.
        </Paragraph>
        <Action href={actionUrl}>
          {isNewAddress ? 'Confirm this address' : 'Approve the change'}
        </Action>
        <Paragraph quiet>
          {NOT_YOU}{' '}
          Nothing moves unless both sides agree, so one ignored email is enough to stop it.
        </Paragraph>
        <Fallback href={actionUrl} />
      </Shell>
    ),
  };
}

export function reauthenticate({ siteUrl }: { siteUrl: string }, code: string): Rendered {
  return {
    subject: 'Your Magpi confirmation code',
    body: (
      <Shell preview='The code Magpi just asked you for.' siteUrl={siteUrl}>
        <Heading>Your confirmation code</Heading>
        <Paragraph>Magpi asked you to confirm it is you. The code is:</Paragraph>
        <Heading>{code}</Heading>
        <Paragraph quiet>
          {NOT_YOU} Nobody from Magpi will ever ask you to read this code out.
        </Paragraph>
      </Shell>
    ),
  };
}

/** Magpi's own, rather than the auth server's: an organization asking somebody to join it. */
export function orgInvite(
  { siteUrl, actionUrl }: Addressed,
  { organization, invitedBy }: { organization: string; invitedBy: string },
): Rendered {
  return {
    subject: `${invitedBy} invited you to ${organization} on Magpi`,
    body: (
      <Shell preview={`Join ${organization} on Magpi.`} siteUrl={siteUrl}>
        <Heading>You have been invited to {organization}</Heading>
        <Paragraph>
          {invitedBy} added you to {organization}{' '}
          on Magpi, where the team's notes, issues and documents can be asked questions in one
          place.
        </Paragraph>
        <Paragraph>
          You will only see the spaces somebody puts you in. The invitation expires in a week.
        </Paragraph>
        <Action href={actionUrl}>Join {organization}</Action>
        <Paragraph quiet>
          If you were not expecting this, ignore it. Nothing is shared with you until you accept.
        </Paragraph>
        <Fallback href={actionUrl} />
      </Shell>
    ),
  };
}
