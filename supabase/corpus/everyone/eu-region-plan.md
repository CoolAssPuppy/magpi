# EU region plan

Owner: Kenji Mori
Last edited: 14 April 2026
Status: planned, targeting Q3
Linear: `INF-311`

Two customers have asked for their data to stay in Europe. This page is the plan
for giving it to them, written after a week of reading our own deployment and
about half a day of talking to Elena about what was actually promised.

Short version: a second Portside deployment in Frankfurt, a per account pin that
decides which deployment an account lives in, and no change at all for the other
212 accounts. I think this is Q3 work and I think Q3 is achievable.

## Who asked, and what they asked for

**Bergstrom Logistik.** Asked in writing during their renewal conversation in
March. Their compliance lead's position is that personal data of their staff and
their carriers' drivers should be stored and processed in the EU, and that they
need to be able to say so to their own customers with a straight face. This is
the harder of the two requests because it is written into a renewal.

**Marchetti Freight.** Asked Elena on a call in February. Less formal, and the
phrasing was closer to "our lawyer will ask us this next year". Marchetti is not
blocking a renewal on it. They will be the second account we move, and probably
the one we test the migration on if Bergstrom would rather not be first.

Nobody else has asked. Elena's read is that two more accounts in her pipeline
would ask if we could say yes, which is a reason to do this properly rather than
a reason to do it faster.

## What has to stay in Europe

I went through this table with Elena and with Bergstrom's compliance lead on a
call on 2 April. The right hand column is what we are committing to.

| Data | Where it lives today | Where it must live |
| ---- | -------------------- | ------------------ |
| Thread messages and bodies | US primary | EU |
| Attachments, photos, documents | US object storage | EU |
| Contacts: carrier and shipper people | US primary | EU |
| User accounts and staff details | US primary | EU |
| Audit log entries | US primary | EU |
| EDI 214 messages, raw and parsed | US primary | EU |
| Search index entries | Derived from the primary | EU |
| Aggregate usage counters, shipment counts per month | US primary | May stay in the US, no personal data |
| Billing records, invoices, plan history | US primary | Undecided, see below |

Billing is the open one. Invoices carry a company name and a billing address and
Ade thinks that is company data rather than personal data. I am not qualified to
have that opinion. Assume for planning that billing stays where it is, and if the
answer comes back the other way it adds work at the end rather than changing the
shape of anything.

## The pieces of work

**1. Database in eu-central-1.** A second primary, same schema, same migrations,
run from the same repository. Migrations have to apply to both, which means the
deploy pipeline gets a region loop and a way to fail the deploy if the two
regions drift.

**2. Object storage in the same region.** Bucket per region. The attachment path
already goes through a storage client, so this is configuration plus making sure
nothing anywhere builds a bucket URL by hand. I found two places that do.

**3. Region aware router.** Every request arrives with an account context. The
router looks up that account's home region and sends the request to the right
deployment. The lookup table is small, global, read mostly, and cached. An
account that is not in the table is US, which keeps every existing account
working with no data change.

**4. Per account region pin.** The pin is set when the account is created and
never moves. There is no setting for it in the product and there will not be one.
Sales tells us during onboarding, or a support engineer sets it with a tool, and
the account lives there for the rest of its life. Moving an account between
regions is a manual migration with a maintenance window, done by hand, twice a
year at most.

**5. Migrate the two accounts.** Dry run against a copy of Bergstrom's data
first, verify record counts and attachment counts, then a real cutover in a
window they choose.

## Timeline

| Date | What |
| ---- | ---- |
| 24 July | Region aware router in production, everything still routing to US |
| 7 August | EU database and storage stood up, empty, migrations applying to both |
| 21 August | Per account pin, with the support tool to set it |
| 4 September | Dry run migration of Bergstrom data on a copy |
| Late September | Bergstrom live in Frankfurt, Marchetti to follow |

That gives about three weeks of slack inside the quarter, which for
infrastructure work is thin but not dishonest.

## Risks

**Background jobs assume one queue and one database.** The trueup, the export
cursor, the retention job, the digest emails. Each one needs to either run per
region or know which region it is asking about. I have listed them and I think
most are a configuration change.

**Support tooling shows one region.** Hal's team has an internal view that
queries the primary directly. It will show half the world once there are two. Not
hard, needs doing before the first EU account goes live, or support will think a
customer's data has vanished.

**I have not read the audit log writer.** I have assumed it takes a connection
string like the rest of the write path and will follow the router change without
much trouble. If that assumption is wrong, the estimate is wrong, because the
audit log is the entire reason Bergstrom asked. I will read it in the first week
of the work.

**Two deployments, one on call rota.** Everything we run doubles. Dashboards,
alerts, deploys, the runbook. This is the cost that does not appear in any of the
five items above and it does not end when the project ends.

## What I am explicitly not doing

- No EU failover or cross region redundancy. Frankfurt is a home for accounts that
  need one, not a disaster recovery plan.
- No data residency for anything derived that contains no personal data. Metrics
  and aggregate counters stay in one place.
- No self serve region choice in the product, now or later.

## Open

- Confirm with Elena which of the two accounts is willing to be first.
- Ade and Elena to get an answer on billing records.
- Ask Priya whether the trueup can run per region without
