'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAuthSessionMissingError, type OAuthAuthorizationDetails } from '@supabase/supabase-js';

import { AuthShell } from '@/components/auth/auth-shell';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

/** What each scope actually lets the client do, in the words a person needs to decide. */
const SCOPE_MEANING: Record<string, string> = {
  openid: 'Know that it is you',
  email: 'See your email address',
  profile: 'See your name',
};

function describeScope(scope: string): string {
  return SCOPE_MEANING[scope] ?? scope;
}

/** The name to show for a client that registered itself, which may have given no name at all. */
function clientName(details: OAuthAuthorizationDetails): string {
  const name = details.client.name?.trim();
  return name && name.length > 0 ? name : 'An application';
}

export function OAuthConsent({ authorizationId }: { authorizationId: string | null }) {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [decided, setDecided] = useState(false);
  const deciding = useRef(false);

  useEffect(() => {
    let live = true;

    async function load() {
      if (!authorizationId) {
        setError('This page needs an authorization to act on. Start again from the application.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError && !isAuthSessionMissingError(userError)) {
        if (live) {
          setError(userError.message);
          setIsLoading(false);
        }
        return;
      }

      // Signing in comes first, and brings them back here to the same authorization.
      if (!user) {
        const here = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/sign-in?next=${encodeURIComponent(here)}`);
        return;
      }

      const { data, error: detailsError } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (detailsError) {
        if (live) {
          setError(detailsError.message);
          setIsLoading(false);
        }
        return;
      }

      // Already approved once: Supabase answers with where to send them rather than what to ask.
      if (!('authorization_id' in data)) {
        window.location.replace(data.redirect_url);
        return;
      }

      if (live) {
        setDetails(data);
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      live = false;
    };
  }, [authorizationId]);

  const decide = useCallback(
    async (approve: boolean) => {
      if (!authorizationId || deciding.current) return;
      deciding.current = true;
      setDecided(true);
      setError(null);

      const supabase = createClient();
      const { data, error: decisionError } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });

      if (decisionError) {
        deciding.current = false;
        setDecided(false);
        setError(decisionError.message);
        return;
      }

      window.location.replace(data.redirect_url);
    },
    [authorizationId],
  );

  if (isLoading) {
    return (
      <AuthShell title="One moment" description="Reading what this application is asking for.">
        <div className="h-20 animate-pulse rounded-[var(--radius-control)] bg-muted" />
      </AuthShell>
    );
  }

  if (!details) {
    return (
      <AuthShell title="This request cannot be read">
        <FormError message={error} />
      </AuthShell>
    );
  }

  const scopes = details.scope.split(' ').filter((scope) => scope.length > 0);

  return (
    <AuthShell
      title={`${clientName(details)} wants to read your Magpi`}
      description="It will act as you. It can see what you can see, and nothing else."
    >
      <div className="flex flex-col gap-6">
        <FormError message={error} />

        <ul className="flex flex-col gap-2 text-sm text-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="text-tertiary-foreground">
              &bull;
            </span>
            Search and read the documents in your spaces
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-tertiary-foreground">
              &bull;
            </span>
            Write notes into a space you are a member of
          </li>
          {scopes.map((scope) => (
            <li key={scope} className="flex gap-2">
              <span aria-hidden className="text-tertiary-foreground">
                &bull;
              </span>
              {describeScope(scope)}
            </li>
          ))}
        </ul>

        <p className="text-sm text-tertiary-foreground">
          Signed in as {details.user.email}. You can take this back at any time.
        </p>

        <div className="flex gap-3">
          <Button onClick={() => decide(true)} disabled={decided} className="flex-1">
            Allow
          </Button>
          <Button
            variant="outline"
            onClick={() => decide(false)}
            disabled={decided}
            className="flex-1"
          >
            Deny
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
