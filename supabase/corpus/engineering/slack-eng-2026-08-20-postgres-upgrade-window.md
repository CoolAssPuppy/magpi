# #eng, 20 August 2026

Thread started by Kenji Mori at 08:55.

**Kenji Mori** (08:55)
`INF-322`. I need a maintenance window for the Postgres major version upgrade
and I need it agreed this week, not next.

Background for anyone who has not read the issue: we are a major version behind
what our provider supports on this plan. If we do not pick a window they pick
one for us in November with two weeks notice.

**Kenji Mori** (08:57)
Shape of it. Promote the replica, upgrade the old primary, swap back. Writes
unavailable for ten to fifteen minutes, reads up the whole time behind a banner.
Three hour window because I want room to stop and go backwards.

**Kenji Mori** (08:58)
Three candidate Sundays. 30 August, 6 September, 13 September. After that we are
inside the billing work and I am not going near it.

**Priya Raman** (09:14)
13 September is out. The dual run is the Monday morning. If the upgrade goes
badly on the Sunday I lose the dual run and the dual run is the thing that tells
me whether the migration is real.

**Priya Raman** (09:15)
Strong preference for before the dual run rather than after. I want the dual run
executing on the version the October cutover will execute on. Running it on the
old version and then upgrading underneath it means the one rehearsal we get was
a rehearsal of something else.

**Kenji Mori** (09:21)
Agreed and that rules out anything in October too.

**Marcus Ilic** (09:30)
What is wrong with 30 August.

**Kenji Mori** (09:33)
Filters and saved views ship on the 28th. I do not want to be doing a major
version upgrade forty eight hours after a release that touches the thread list
query, because if something is slow on the Monday we will have two candidate
causes and spend the day arguing about which one.

**Nadia Osei** (09:35)
Seconding that from the other side. Give me a week of the filters being in
front of people before you change the thing underneath them.

**Marcus Ilic** (09:38)
Then it is 6 September. Kenji, is a week enough gap for you.

**Kenji Mori** (09:41)
Yes. Eight days from the release, eight days to the dual run. That is the widest
gap available and it is enough on both sides.

**Kenji Mori** (09:44)
Sunday 6 September, 03:00 to 06:00 UTC. I will be online from 02:30.

Freeze on migrations from close of play Friday 4 September to the Monday
morning. No schema changes, no index changes, nothing in `infra`. Normal
application deploys are fine after 08:00 Monday.

**Priya Raman** (09:46)
Fine. I have nothing landing that weekend.

**Marcus Ilic** (09:52)
Rollback plan in one sentence.

**Kenji Mori** (09:58)
If the upgraded primary does not come up clean we do not swap back. The promoted
replica is already serving on the old version, so we stay there and I retry on a
later Sunday having learned something. The bad outcome is a week on a single
node with no replica, which I can live with for a week.

Worse than that, the logical backup from Saturday night restores into a fresh
instance in about ninety minutes. I have done that restore eleven times this
year because it is the Monday check.

**Marcus Ilic** (10:01)
Good. Do it.

**Priya Raman** (10:14)
One thing I want written in the issue. The upgrade resets planner statistics.
After June I am not willing to find that out on the Monday morning from a
support ticket.

**Kenji Mori** (10:17)
Already in the plan. `ANALYZE` across the database before we lift the banner,
then the hot query list from `INF-321` against the four biggest accounts,
compared against the plans I capture on the Friday. If a plan has changed shape
I would rather know at 05:00 with the banner still up.

That check exists because of June.

**Hal Winters** (11:02)
What do I tell customers.

**Kenji Mori** (11:06)
Scheduled maintenance, Sunday 6 September, three hour window overnight UK time.
Portside stays readable throughout. Sending a message or updating a load may
fail for a few minutes inside it. Anything a carrier emails us during the window
gets queued and lands afterwards, nothing is lost.

**Hal Winters** (11:08)
Enough for me. Banner in the app from the Thursday, help centre notice on the
Monday before. I will write it and send it to you.

**Hal Winters** (11:09)
Do not put "brief interruption" in it. Say minutes and say which minutes. People
plan around a number and they argue with an adjective.

**Marcus Ilic** (11:30)
Locked. Kenji owns it, Priya is the second pair of eyes, nobody else needs to be
awake.
