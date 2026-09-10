# Session queue

Four things asked for in this session, in the order they will be done. The first
two are already underway.

## 1. Comment pass, one line each (in flight)

Every multi-line comment in the repo cut to a single line saying what the code
does. 304 files, 975 blocks, 5207 comment lines. Eight agents working disjoint
file lists.

Excluded: `web/styles/supabase/**` (vendored from upstream, re-synced by
`scripts/sync-tokens.mjs`) and `web/lib/database.types.ts` (generated).

- [x] Rule written, agents dispatched
- [x] Verifier built: parses each changed file, prints it without comments,
      compares before against after. Self-tested against a flipped operator, a
      changed string and a deleted line, all three caught.
- [x] Agents finish
- [x] Verify, run the gate, commit (916d71a, c2862be, e8e47da)
- [ ] `web/app/(marketing)/page.tsx` done by hand, last, because the copy in it
      is being edited live

## 2. Team spaces cannot be created

`createTeamSpace` sends `insert ... select('id').single()`. Postgres applies the
SELECT policy to the RETURNING clause, `spaces_select_member` is membership only,
and the creator is not a member of the space yet, so the row it just wrote is
invisible and the statement is refused. Reproduced against the local database:
the same insert without RETURNING succeeds.

Fix: one `security definer` function that checks org membership, inserts the
space and enrols the creator, and returns the id. This also closes the window
where the second insert fails and leaves a team space with no members, which the
current code has an error message for and no way to recover from.

- [x] `public.create_team_space(p_org_id uuid, p_name text)` in `80_functions.sql`
- [x] Migration, regenerated types
- [x] Action calls the rpc, second insert and its error branch removed
- [x] Five pgTAP assertions, proven to fail when the enrolment is removed
- [x] Unit tests rewritten for the single-statement path

Done in 9527128.

## 3. App chrome

- [ ] Constrained, centred viewport on every main page, header included
- [ ] Section links (Chat, Spaces, Documents, Connections, Dreams) move into the
      header, replacing the tab strip row below it
- [ ] Breadcrumb bar pinned to the bottom edge of the header, inside the same
      constrained width as the rest of the site
- [ ] Footer added to the app shell, theme selector at its bottom right
- [ ] Avatar becomes a dropdown holding Settings and Sign out, plus Admin when
      the signed-in person is an owner or admin
- [ ] Admin gets its own left nav instead of a tab bar
- [ ] New Admin nav item, Searches, holding Search activity, Top questions and
      Questions per day

## 4. Chat screen

- [ ] Conversation rail organised into folders
- [ ] A folder carries a colour
- [ ] New conversation: composer centred, with the greeting above it
- [ ] Existing conversation: composer pinned to the bottom
- [ ] The first question animates the composer from centre to bottom

Schema, decided:

- `conversation_folders`: id, user_id, org_id, name, color, position. Private to
  one person, RLS is `user_id = auth.uid()`.
- `conversations.folder_id`, nullable. Null means unfiled.
- `folder_color` is an enum of names mapping to Supabase semantic tokens. No hex
  column, because `scripts/check-raw-color.mjs` fails the gate on a raw colour
  and an exemption for one column would be the first hole in that rule.
