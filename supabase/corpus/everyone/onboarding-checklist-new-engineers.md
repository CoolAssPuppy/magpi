# Onboarding checklist, new engineers

Owner: Priya Raman
Last edited: 7 July 2026
Audience: new engineers and their buddy. Hiring managers, read the first section

If you are the new engineer: work down this page. It should take three days and
it will probably take four. Tick things in your own copy, not in this one.

If you are the buddy: the accounts in the next section need requesting the week
before, not on the morning of day one. That is the part we get wrong.

## Before day one

Manager does these. If you are reading this on your first morning and none of it
has happened, message me.

- Laptop ordered and shipped, with the disk encrypted before it leaves.
- Accounts requested from the list below.
- A buddy named, from a different team than the new joiner.
- Week one calendar populated with the pairing sessions in this document.
- One small, real, unblocked first issue picked out in Linear. Labelled
  `good-first-issue`. Not a documentation task.

## Accounts to request

| Account | Who requests it | Notes |
| ------- | --------------- | ----- |
| Google Workspace | Manager | Email, Drive, calendar |
| Slack | Manager | Join `#eng`, your team channel, and `#support` |
| Notion | Manager | Everyone space and your team space |
| Linear | Manager | Your team, plus read on everything else |
| GitHub org | Manager | Read on all repos, write on your team's |
| 1Password | Manager | Vault access is per team, ask for what you need |
| Error tracker | Buddy | Read only until you have shipped something |
| Cloud console | Kenji | Read only. Nobody gets write in week one |
| Metrics and dashboards | Kenji | |
| Stripe test mode | Priya | Billing team only. Nobody gets live keys, including me |
| On call pager | Manager | You are not on the rota for at least six weeks |

Production database access is not on this list. You do not get it in week one and
you will not need it. Ask when you need it, and expect to be asked what for.

## Repos to clone

```
portside-api        the monolith, most of the product, Postgres and the job queue
portside-web        the web client
portside-billing    plan fees, proration, the ledger, the month end trueup
portside-edi        the 214 parsers and the feed ingestion
portside-mobile     the mobile client, first release shipped in July
infra               terraform, deploy pipeline, alerts, the runbooks
```

Everything is in the `alderwick` GitHub org. `portside-api` is the one you will
spend most of your time in whatever team you are on.

## The local stack

From `portside-api`:

```
make bootstrap    installs dependencies, sets up hooks, writes .env from .env.example
make dev          docker compose up, then the api and the web client
make seed         seed data
make test         everything. Should be green on a clean clone
```

`make dev` brings up Postgres, the job queue, an object storage emulator, a local
mail catcher, the API and the web client. The mail catcher is worth knowing about
on day one: Portside sends and receives email as its main way of talking to the
world, so almost every local test of anything real ends with you opening the mail
catcher at localhost:8025 and reading what we just sent.

`make seed` gives you about four hundred shipment threads across eleven accounts.
Three of those accounts are deliberately awkward, because those are the shapes
that break things:

- One account with a negotiated shipment allowance that is not the plan default.
- One account on an annual commitment paid monthly.
- One account whose EDI feed goes through the legacy 214 parser.

Sample 214 messages live in `portside-edi/fixtures`. They came from real customer
feeds and are anonymised. Do not add a fixture that is not.

If `make bootstrap` fails, it is almost always the Postgres version. Check the one
in `docker-compose.yml` against whatever you have on 5432 and turn yours off.

I keep meaning to record a walkthrough of this as a video and I keep not doing it.

## Week one pairing

Three hours each, on the calendar before you start. You do the talking half the
time.

| Session | With | What you get out of it |
| ------- | ---- | ---------------------- |
| The data model | Priya Raman | Accounts, threads, messages, shipments, audit. Where the joins hurt |
| Two hours in the support queue | Hal Winters | Not optional, for anybody, in any role |
| What the product is for | Sofia Berg | Who buys it, why, and what we have said no to |
| Your team's area | Your lead | Nadia for search, Kenji for infrastructure, Priya for platform and billing, Ruth for the front end |

The support session is the one people try to skip and the one everybody says
afterwards was the most useful. Sit next to Hal or Rosa, read real tickets, watch
somebody explain an invoice to a person who is annoyed.

Billing has a specific note. Jonah Kestrel wrote most of it and moved to the
search team on 1 July, so his handover document is now the primary source and it
is in the engineering space. Read it before you touch anything in
`portside-billing`, and pair with me rather than with him. He will answer
questions and he is not the owner any more.

## Your first pull request

Open it in week one. It does not matter how small.

- One logical change per pull request. If the title needs the word "and", split it.
- Tests first. If you cannot write a failing test for it, say so in the
  description and say why.
- No `any` in TypeScript. The build will fail and you will have found this out
  the slow way.
- The description says why, not what. The diff already says what.
- Link the Linear issue. Linear picks up the branch name if you use the one it
  generates.
- Green CI before you ask for review, not after.

Review rules: two approvals for anything in `portside-billing` or `infra`, one
everywhere else. Nobody merges their own change to those two repos, including
Marcus.

You do not need permission to open a pull request, and you do not need to
apologise for it in the description.

## Week two and after

- Ship something a customer can see by the end of week two. If that is not going
  to happen, have the conversation on the Monday rather than the Friday.
- Read the last three decision records in the Everyone space.
- Read the current quarter plan, then the section called what moved out.
- Shadow one on call handover before you go on the rota.

## Things that will confuse you, said in advance

- Billing has its own vocabulary and most of it predates any current employee. A
  trueup is the month end job that counts shipments and adds the overage.
- The audit log is written on every write and is read by four things that each
  assume they are the only reader. Kenji is dealing with that.
- Search ranking is a hand tuned expression that several people have adjusted and
  nobody currently defends.
- There are two EDI 214 parsers and the old one is not dead yet. There is a Linear
  issue explaining why, and the reason is contractual rather than technical.
