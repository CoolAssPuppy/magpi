# Tech debt audit, 2026-09-11

Generated against `28e9099` by two readers, one on security and data integrity
and one on code quality, plus a verification pass. The previous audit is
`docs/tech-debt-audit.md` and stays where it is: this one covers what changed
since, which is the connection model, the corpus, and chat folders.

Every finding says whether it was **reproduced** against the running database or
only **read**. A finding that was only read is a suspicion.

## What was fixed tonight

All of these were found, reproduced, fixed and re-reproduced in the same
session. They are listed because the shape of each one is worth remembering, not
because anything is outstanding.

**A member of one destination could tap the rest of a connection.** Reproduced.
`requireConnectionAccess` passed for anybody in one of a connection's
destination spaces, and `requireRoutableSpaces` then accepted any space in the
org that the caller belonged to, including one they had just created and were
alone in. Chained, Ben could re-point `#finance` and `#supply-chain` from the
Finance space, which he is not in, into a space only he could open, on Jane's
connection, invisibly to her because the view model filters routes it cannot
see. Only the owner may now send an account somewhere new. Anybody else may move
a unit between destinations it already has, or stop routing it.

**The guards' own tests could not fail.** Reproduced by deleting each filter in
turn. `stubDb` answers with whatever its closure returns and ignores the query,
so every filter in both guards could be removed with all eleven tests still
green. The commit that added them claimed the opposite, which was wrong: what
had been verified was the set difference, not the database filter. The stub now
answers from a fixture with the request's filters applied, and each of the four
filters has a test that dies without it.

**`anon` and `authenticated` held TRUNCATE on every table in `public`.**
Reproduced: as `authenticated`, with a control proving RLS was live in the same
transaction, `truncate public.conversation_folders cascade` removed every
folder, conversation and message. TRUNCATE ignores row level security entirely.
The grants arrive with the stock Supabase roles, along with REFERENCES, TRIGGER
and MAINTAIN, and 46 of them are now revoked. The pgTAP tripwire compared only
the four privileges PostgREST emits, so it could not see them, and now compares
every privilege.

**One malformed row took the connections page down for everybody but its
owner.** Reproduced. `routes_into_visible_space` called `jsonb_each_text` on
whatever `routes` held and cast each value to uuid, so a non-object or a
non-uuid raised. The owner never reached it, because their own branch of the
policy short-circuits first. It now treats a malformed column as routing
nowhere.

**A chat could name somebody else's folder.** Reproduced before the fix and
refused after. `conversations.folder_id` had a plain foreign key. It is now
composite on `(folder_id, user_id)`, which refuses the write even under the
service role rather than relying on a policy.

**Deleting a folder was impossible.** Reproduced. The composite key above used a
bare `on delete set null`, which nulls every column in the key including
`user_id`, which is not null. This is `docs/lessons.md:146` verbatim, written
after the same mistake on `dream_runs.space_id`, and it was made again by
somebody who had the entry available and did not read it. `on delete set null
(folder_id)` fixes it. pg-delta does not compare the column list a SET NULL
names and reported no change, so that migration is hand-written.

**An unrouted Linear connection burned its backlog.** Read, then confirmed
against the fixtures. `changeFilter` omits the team clause when nothing is
routed, so Linear read the whole workspace, sync dropped every issue for having
nowhere to land, and the cursor advanced past them anyway. Routing a team
afterwards would have started from the newest issue already seen. Two test
fixtures were leaning on that behaviour.

## Open

**The nightly dream is never enqueued.** Read. `schedule_workers()` runs
`dream-worker` at 02:00 UTC, and that worker drains `dream_runs` where `status =
'queued'`. The only thing that creates a run is `dream-run`, the manual button
on a space page. So the cron fires nightly into an empty queue. Nothing dreams
unless a person presses the button. This matters twice over: it is why real use
would never dream, and the keynote says the brain dreams every night.

**The dream cannot digest a backfill.** Read, with arithmetic. `MAX_INPUT_CHUNKS`
is 120 and the lookback is 24 hours, so a dream covers 120 chunks per space per
night whatever arrives. Importing a 4,295 file repository costs about 18 cents
in embeddings and then roughly 92 nights before the brain has considered it. The
caps are right for a daily trickle and wrong for an import.

**`public.search` raises on a long enough question.** Read, then reproduced
earlier in the session against a dense upload. `websearch_to_tsquery` raises
`tsquery stack too small` once the text has enough terms. The dream no longer
sends a whole document, which is what was hitting it, but a person pasting a
wall of text into chat still can. The fix is a guard inside the function, which
means a migration and a change to the live query path.

**A Drive file in two routed folders lands in whichever parent Drive lists
first.** Read. Arbitrary, and it wants a rule.

**Re-routing a unit does not move the documents already filed under it.**
Deliberate. Moving them would leave their chunks pointing at the old space.
Recorded here so it is a decision rather than a surprise.

## Not re-verified

The previous audit's findings 1 and 2, the space `org_id` escalation and the
storage path traversal, were checked and are fixed: `95_grants.sql` now uses a
column grant, and `isUploadInSpace` validates the prefix and rejects traversal.
Findings 9 and 10 are fixed, `usage_events` with `kind = 'query'` is written by
`lib/chat/meter.ts` and the mobile-spec check passes on every cited path.

Findings 3 through 8 of that audit were not re-checked tonight. They are not
known to be open and they are not known to be closed.

## Coverage

118 test files, 1079 tests, all passing. Statements 94.31 percent against a 95
threshold, branches 89.97 against 90, lines 94.99 against 95. The full gate is
red on that step alone.

`components/documents/upload-dialog.tsx` and
`components/spaces/create-space-dialog.tsx` have no tests at all and are 59 of
the 143 uncovered statements between them. Both predate this session.
