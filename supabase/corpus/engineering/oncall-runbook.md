# On call runbook

Owner: Priya Raman
Date: 23 March 2026
Status: in force
Audience: whoever is holding the pager this week

Read this on the Monday you pick up the pager, not on the Wednesday you get
paged. It takes eleven minutes.

Alert definitions live in `infra/alerts`. If you change one, change this page in
the same pull request.

## The rotation

Seven engineers. One week each, Monday to Monday, handover at 10:00 in the eng
call. Primary and secondary, and the secondary is the person who held it last
week, because they still have the context.

Nobody holds the pager two weeks running. Nobody goes on the rota inside their
first six weeks. If you are going to be somewhere without signal, swap in
advance in `#eng` and say who took it.

Kenji is not on the rota as primary. He is the escalation for anything that is
the cloud rather than the product, and he cannot be both.

If you are paged and have no idea what you are looking at, that is normal and it
is not a reason to sit with it for forty minutes. Wake the secondary.

## What pages and what does not

Pages, any hour:

- Portside is not serving requests.
- Login is failing for everybody.
- A customer can see data that is not theirs.
- Inbound mail has stopped being accepted.

Pages, working hours only:

- Job queue backed up past the threshold.
- EDI feed stale for an account.
- Error rate above the threshold on any endpoint.

Does not page, ever:

- A single failed job. The dead letter table is reviewed on Thursdays.
- The nightly backup restore check. It opens a Linear issue.
- Anything in the billing service after the trueup run. See the section below.

Severity levels are in Hal's escalation page. The one thing you need from it: on
an S1, post in `#support` and `#eng` and keep updating one thread. The thread is
the record.

## The five alerts you will actually get

### 1. `inbound_mail_lag`

Fires when the oldest unprocessed message in the inbound mail queue is over ten
minutes old.

Almost always the `inbound_mail_process` workers, not the webhook. Check the
`jobs` table depth for that job type first. If the depth is high and climbing,
look for one message that is failing and being retried, because at least once
delivery plus a poison message equals a queue that looks busy and is doing
nothing. Move it to the dead letter table by hand and the queue drains.

If the depth is zero and the lag is real, the webhook is not being called. That
is the mail provider. Tell support, because customers notice within the hour:
their carriers reply and nothing appears.

### 2. `edi_feed_stale`

Fires when an account with an active feed has had no 214 in six hours during a
working day.

Check which parser. If it is one of the seven accounts on the 2021 parser, and
it is one of the two whose batches time out, this is the known thing and the
answer is to rerun the batch with the splitter chunk size lowered. There is a
one line command in `portside-edi/README`. Note it in the Linear issue for the
legacy parser so the count stays honest.

If it is an account on the 2024 parser, look at the SFTP drop before you look at
the code. Nine times in ten the customer's side stopped sending.

### 3. `job_queue_depth`

Fires at five thousand queued jobs across all types.

Look at the breakdown by type before you do anything. Attachment thumbnailing
spiking is boring and self resolving. Outbound send spiking is not, because that
means customers are writing messages that are not going out.

Worker pool restarts are safe. Do that first, watch for four minutes, then
start looking for the cause.

### 4. `api_error_rate`

Fires at more than one percent 5xx on any endpoint over five minutes.

Get the endpoint and the account. Most of our 5xx spikes are one account doing
something unusual at volume, and the fix is a conversation rather than a deploy.
If the errors are spread across accounts and endpoints, look at the last deploy
and be willing to roll it back before you understand it. The pipeline in `infra`
does that in about four minutes.

### 5. `trueup_failed`

Fires when the month end trueup job exits non zero, or does not report at all.

This is the one with a different rule. Read the next section.

## The billing rule

**A billing alert that fires after the trueup run wakes Ade Fashola, not an
engineer.**

The trueup runs in the small hours of the last day of the month. If it fails, or
if it completes and the reconciliation report is wrong, the alert routes to Ade
and only to Ade.

The reason is that we did it the other way round for a year and it was a waste
of everybody. An engineer at 03:00 can see that a job failed. They cannot see
whether the number is wrong, because that depends on which accounts have a
negotiated allowance, which are on an annual commitment, and what Ade changed in
the admin form on the twenty ninth. Ade reads that in twenty minutes. An
engineer reads it in two hours and then asks Ade.

Nothing bills until Ade releases the run. There is no customer facing
consequence of the trueup being fixed at 09:00 instead of 03:00, and there is a
real consequence of an engineer guessing at an invoice.

Ade reads the run log, decides whether it is one account or all of them, and
either fixes the account data himself or opens an S2 with his working attached.
If he decides it needs an engineer overnight he pages, and then it is a normal
page.

The exception, and it is the only one: if the failure is the job not running at
all and there is a scheduled billing send inside twelve hours, that is an
engineer, immediately. Ade cannot restart cron.

## Escalation

1. On call primary. Fifteen minutes to acknowledge.
2. Secondary. Ten more minutes.
3. Marcus. His number is on the rota page and he has said in writing that he
   would rather be rung than not.

For anything that is the cloud rather than the product, Kenji, at any point,
including step one. For anything that is money, Ade, on the same terms.

You are not expected to fix it alone. You are expected to answer the pager and
to say out loud what you have ruled out.

## After

Same day, tell support it is over, in words they can send to a customer.

Next working day, if it reached S1 or S2, open the postmortem doc from the
template. Three actions, each with a name and a Linear issue, or it is not a
postmortem, it is a story.
