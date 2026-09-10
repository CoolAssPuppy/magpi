# How we write things down

| | |
| --- | --- |
| Owner | Jane Okonkwo |
| Status | Active |
| Last edited | 2026-08-20 |
| Tags | process, company, writing |

## The rule

Decisions live in Notion. Work lives in Linear. Conversation lives in Slack.

A thing said in Slack and nowhere else did not happen, and every person here has
lost an afternoon to reconstructing one. That is the entire reason this page
exists.

## What each tool is for

| Tool | What goes in it | What does not |
| --- | --- | --- |
| Notion | Decisions, specs, runbooks, plans, notes from a meeting | A task with a due date |
| Linear | Work with a state and an assignee | A decision with no issue attached to it |
| Slack | Thinking out loud, asking, telling | Anything you will need to find in October |
| Drive | Long prose, board updates, test reports, anything with figures | Anything that needs to be edited by several people |

## Anatomy of a decision record

Every decision record has these, in this order. A page missing any of them is
not finished.

1. A title that names the subject. Outer layer decision record works as a title.
   "We picked polymer" ages badly the first time the decision moves.
2. A properties block with an owner, a status and a date.
3. Context. What made this a question.
4. A Decision callout with a date in it.
5. An options table with what each option costs.
6. What we gave up.
7. Open questions as checkboxes.
8. A history table if the decision has moved.

> The options table is the part people skip and it is the part that saves you.
> Six months from now the question will not be what we chose. It will be what
> else we looked at and why it lost.

## Reversals

When a decision reverses, the new decision goes in the same page. Add a
Supersedes line. Leave the old decision visible in the history table. Do not
start a second page, because then there are two answers to one question and a
search finds whichever one it likes.

**Should I delete a page that is wrong?**
No. Mark it superseded or stale and say what replaced it. A deleted page turns
into somebody's memory of a page, which is worse.

**What if the page has no owner any more?**
Put your name on it or tell Jane. Ownerless pages rot in about a month.

## Naming

| Kind of page | Title looks like |
| --- | --- |
| Decision | Outer layer decision record |
| Spec | Bellows torque and detent spec |
| Runbook | Runbook: Ori shell crash on a dev unit |
| Test plan | Hinge cycle test plan |
| Meeting | All hands, 28 August 2026 |

## Status values

| Status | Means |
| --- | --- |
| Draft | Being written, do not rely on it |
| Active | Current and maintained |
| Decided | A decision was made and it stands |
| Approved | Signed off, changing it needs a review |
| Superseded | Replaced. The replacement is linked. |
| Stale | Nobody has maintained this and it may be wrong |
