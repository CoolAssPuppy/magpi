# Portside architecture overview

Owner: Marcus Ilic
Date: 27 January 2026
Status: current
Audience: engineers, plus anyone who needs to name a piece of Portside in a
document and wants to name the same thing everyone else names

This page exists so that the rest of our writing can say "the thread router" or
"the trueup job" and mean one thing. It is a map, not a design document. If you
want to know why a piece is shaped the way it is, the decision records are in
the Everyone space.

## The shape of it

Portside is a monolith with two things bolted to the side of it.

The monolith is `portside-api`. It holds the HTTP API, the web session layer,
the thread service, the message store, attachments, accounts and users, the
admin tools, and the job queue. Almost everything you will ever change is in
here.

The two things bolted on are `portside-billing`, which is its own deployable
because it holds card data adjacent code and we wanted the blast radius small,
and `portside-edi`, which is its own deployable because the feed parsers need to
be restarted without restarting the product.

Everything talks to one Postgres primary. There is a read replica and almost
nothing uses it, which is a fact about us rather than a design.

## The database

One Postgres cluster. One primary, one replica, one nightly logical backup that
Kenji restores into a scratch instance every Monday so we know the backup works.

The tables that matter, in the order you will meet them:

- `accounts`, `users`, `memberships`. An account is a brokerage. A membership is
  a seat and seats are what we charge for.
- `threads`. One shipment, one thread. Carries `account_id`, the reference
  number, status, `last_message_at`, and the search vector.
- `messages`. Email in both directions, internal notes, and system events.
  Ordered by `created_at` within a thread.
- `attachments`. Metadata only. The bytes live in object storage.
- `status_events`. Parsed 214 statuses, one row per status, tied to a thread.
- `audit_log`. Every write, with actor and time.
- `invoices`, `invoice_items`, `trueup_runs`. Billing's tables, in the same
  database as everything else, which surprises people.

Migrations live in `portside-api/db/migrate` and run on deploy. Billing and EDI
do not carry their own migrations. There is one schema and one place it changes.

## How a thread gets its contents

Two paths in, and they do not look alike.

**Email.** Every thread has its own address. It looks like
`load-8813@in.portside.app` and it goes on every outbound message as the reply
to. Inbound mail arrives at our mail provider, which posts it to
`POST /hooks/inbound-mail` on `portside-api`. The handler writes the raw message
to object storage first and acknowledges the webhook second, so a parse failure
never loses an email. A job called `inbound_mail_process` then picks it up.

The piece that decides where a message goes is the **thread router**. It tries
the address token first, then the `In-Reply-To` header, then the reference
number in the subject, and if all three miss it puts the message in the
account's unmatched queue for a human. About one message in three hundred lands
there.

**EDI.** `portside-edi` polls the SFTP drop and the feed mailbox on a schedule,
splits batches into individual 214 messages, and parses each one. There are two
parsers. The 2024 one is tolerant and handles everybody. The 2021 one is still
running for seven customers whose feeds the tolerant parser rejects. Parsed
statuses are posted into `portside-api` over an internal endpoint, which writes
`status_events` and appends a system message to the thread.

Both paths end in the same place: a row in `messages` or `status_events`, an
`audit_log` append, and a search vector rebuild on the thread.

## Search

Postgres full text, in the same database.

`threads.search_vector` is a `tsvector` maintained by a trigger. The trigger
fires on message insert, rebuilds the whole vector for the thread from the
subject and the message bodies, and writes it back. Ranking is a hand written
`ts_rank` expression in the thread search query, with field weights that several
people have adjusted since 2023.

There is no second datastore and no search cluster. Nadia has a longer document
about what is wrong with this and I am not summarising it here.

## Billing

`portside-billing` owns the money questions and calls Stripe for the charge
itself. Stripe takes payment. Everything about what to charge is ours.

Three pieces:

- **Invoice assembly.** Turns a plan fee, seat count and any adjustments into
  invoice line items.
- **Proration.** What happens when somebody changes plan mid month. It
  recomputes from invoice history rather than from a ledger, and it is four
  hundred lines.
- **The trueup.** The month end job that counts shipments per account, applies
  the included allowance, and adds the overage. It runs on cron rather than on
  the job queue, which means a failure is quiet until Ade notices.

Eleven accounts have a negotiated allowance that is not the plan default. Six
are on an annual commitment paid monthly. Those two facts are responsible for
most of what is complicated in here.

## The job queue

Postgres backed. A `jobs` table, a worker pool in `portside-api`, at least once
delivery, and a dead letter table that somebody should look at more often than
we do. Inbound mail processing, attachment thumbnailing, outbound send, EDI
posting and the nightly retention pass all run here.

The trueup does not. That is the exception and it is the one that matters.

## The audit log

`audit_log` is appended on every write that touches a thread. The writer opens a
connection to the primary at process start through a helper called
`getPrimaryPool()` and holds it for the life of the process.

Three other things read the audit log through the same helper: the export
cursor, the retention job, and the compliance export. All three assume that
reading from the primary is the same as reading all of it. That assumption is
true today. It is the reason a second region is not a small piece of work.

## Repositories

All in the `alderwick` GitHub org.

| Repo | What is in it |
| ---- | ------------- |
| `portside-api` | The monolith. API, threads, messages, attachments, accounts, admin, job queue |
| `portside-web` | The web client |
| `portside-billing` | Invoice assembly, proration, the trueup |
| `portside-edi` | Both 214 parsers, the feed poller, the batch splitter |
| `portside-mobile` | The mobile client. In development, nothing released |
| `infra` | Terraform, the deploy pipeline, alert definitions, the runbooks |

Two approvals to merge in `portside-billing` and `infra`. One everywhere else.
Nobody merges their own change to those two, me included.

The deploy pipeline, the alerts and the on call rota are in `infra` and in the
runbook rather than here. Rate limits are documented nowhere, which is a gap
somebody should close.
