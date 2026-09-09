# #eng, 14 July 2026

Thread started by Jonah Kestrel at 14:02.

**Jonah Kestrel** (14:02)
Priya, doing this here rather than in a call so it is searchable. The handover
doc is in Notion and it is accurate. This thread is the four things people ask
me in person that the doc says in a way nobody reads.

**Jonah Kestrel** (14:03)
One. The cron. It is in `portside-billing/crontab` and it says
`0 2 28-31 * *`. It is not a monthly cron. It runs on four possible nights and
the first thing the job does is check whether tomorrow is the first, and exit 0
if it is not.

So on three nights out of four it starts, decides it is not wanted, and exits
silently. Which means "the trueup ran" and "the trueup did something" are
different sentences and the monitoring only knows the first one.

**Priya Raman** (14:06)
That explains the log noise. I assumed those were retries.

**Jonah Kestrel** (14:07)
No retries. There is no retry anywhere in this job, which is deliberate, because
a retry that half wrote invoice items is worse than a failure.

Also the run row gets stamped after the pre-flight, which walks every account.
That is why the log says something past two rather than two on the dot, and why
three people have told me the cron is wrong.

**Jonah Kestrel** (14:11)
Two. The tables. `trueup_runs` is one row per run, `trueup_lines` one row per
account per run. `billing_ledger` and `billing_ledger_entries` are the pair I
was building the proration rewrite against in March and they are half populated.

You are deleting both of those. I would delete them and not read them. The rows
in there are not a record of anything that shipped.

**Priya Raman** (14:12)
Good. That was the only part of this I was nervous about.

**Jonah Kestrel** (14:18)
Three. The accounts that are not normal. `account_billing_profiles.custom_allowance`.
Fifteen rows in it. Thirteen are the negotiated allowances. Two are the trial
accounts Ade set up with a zero allowance so sales can demo, which is what broke
the June run, see BIL-233.

That column is written straight from the admin form and does not go through the
audited write path, so there is no record of who set it or when. If a number in
there is wrong you cannot find out how. I have wanted to fix that for two years
and never did.

**Priya Raman** (14:19)
Noted, and that is going in the migration scope rather than the backlog.

**Jonah Kestrel** (14:26)
Four, and this is the actual reason I wanted a thread. There are two places
where the code tells you something that is not true.

**Jonah Kestrel** (14:27)
`getIncludedAllowance(account)` returns the plan default. It does not look at
the custom allowance. The override is applied one frame up in
`applyAccountOverrides()`.

So the function with the obvious name gives you the wrong number for thirteen
accounts, silently, with no error, and it reads like the function you want. Two
people have called it directly. I caught one in review and I did not catch the
other.

**Jonah Kestrel** (14:29)
And `trueup_lines.shipments_counted` is not a count of shipments. It is the
count after credited redeliveries are subtracted, and the raw count is not
stored anywhere at all.

So the reconciliation report and the invoice can differ by a handful on an
account with redeliveries, both are right, and there is no way to show that to a
customer without rerunning the count by hand. Ade knows. Nobody else does.

**Priya Raman** (14:31)
That second one is going to cost us an afternoon at some point and I would
rather it be an afternoon I chose. Both get a name change and a comment before
anything else happens in that file.

**Jonah Kestrel** (14:35)
Yes. Rename the first to `getPlanDefaultAllowance` and it stops being a trap.

Last thing. BIL-204 is still open and it is a fix in code you are going to
delete. Do not close it early. We need the June and July runs clean and the
delete is not tomorrow.

**Priya Raman** (14:36)
Understood. Thank you, genuinely.

**Nadia Osei** (15:10)
he is ours now, please stop asking him about invoices

**Jonah Kestrel** (15:12)
I will answer questions. I am not the owner. Those are different and I am going
to be annoying about the difference for about a month.

**Marcus Ilic** (16:44)
Correct posture. If the answering is still happening in six weeks, tell me.
