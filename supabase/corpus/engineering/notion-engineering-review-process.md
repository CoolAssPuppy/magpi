# Engineering review process

| | |
| --- | --- |
| Owner | Jane Okonkwo |
| Status | Active |
| Last edited | 2026-08-19 |
| Tags | process, engineering, decision |

## What needs a review

Seven people do not need a change control board. We need three things written
down so that nobody has to reconstruct a decision from a Slack thread six weeks
later.

| Change | Review needed | Who has to be there |
| --- | --- | --- |
| Anything that moves the pilot line date | Yes | Jane, Sam, Dana |
| A material or supplier change | Yes | Sam, Dana |
| Hinge geometry, torque or detent | Yes | Sam, Jane |
| Panel state behaviour a user can feel | Yes | Ben, Jane |
| Firmware inside an existing behaviour | No | Ben decides |
| Test plan changes | No | The plan owner decides |
| Anything with a cost consequence over the threshold | Yes | Jane, John |

## How a review runs

1. The person proposing writes the decision record first, with the options table
   filled in and a recommendation. A review with no written options becomes a
   forty minute conversation that produces nothing.
2. Post it in the relevant channel at least a day before.
3. Meet for twenty minutes. Longer than that means the record was not ready.
4. The record gets a Decision callout with a date, and the status moves to
   Decided.
5. If a decision reverses later, the new decision goes in the same page with a
   Supersedes line. We keep the old one visible.

> Keep the superseded decision visible for a practical reason. Six weeks from now
> somebody will find a UTG-3 part number in a bill of materials and need to know
> in ten seconds why it is there and why it is wrong.

**Who can call a review?**
Anyone. Jane does not have to be the one who notices.

**What if we disagree?**
Jane decides. That is the whole escalation path and writing more of one for
seven people would be theatre.

**Does marketing sit in engineering reviews?**
Only when the change is something a customer will see. The outer layer material
qualified because the finish and feel changed.

## Decisions recorded so far

| Decision | Date | Status |
| --- | --- | --- |
| Outer layer material, first pass | 2026-08-12 | Superseded |
| Bellows rev C.4 torque and detent | 2026-08-22 | Approved |
| Outer layer material, reversal to polymer | 2026-08-27 | Decided |
| Charge taper when shut | 2026-09-04 | Decided |
