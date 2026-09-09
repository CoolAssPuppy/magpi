# Weekly product sync, 15 July 2026

Note taker: Sofia Berg
Present: Sofia Berg, Marcus Ilic, Priya Raman, Nadia Osei, Kenji Mori, Hal
Winters, Ruth Adeyemi (from 14:20)
Apologies: Elena Vargas, on a customer call

Forty minutes. Ran over by six.

## Billing migration

Started Monday as planned. Priya has the ledger deletion mapped and says the
first two weeks are reading rather than writing, which she wants recorded so
nobody panics at the standup on the 27th when the pull request count is zero.

Ade has asked to be in the room for the dual run planning. Priya said yes.

## Mobile, first release

Shipped. Three days of usage. Push notifications are working better than I
expected and the failure mode when a reply cannot send is the one we designed, so
that part is fine.

Hal has had four tickets, all of them the same thing: people expecting to upload
from the camera roll. That is second release scope and we knew.

## Search

Nadia and Jonah are on filters. Jonah is two weeks in and Nadia says he is asking
good questions about the query builder, which from Nadia is high praise.

Nadia raised, without much force, that she still thinks this buys two quarters.
Noted. Not reopened today.

## EU region

Kenji: `INF-318` is the whole job now. The compliance export has almost no tests
and he does not want to rewrite the writer until there is something that would
catch him breaking the export. Marcus agreed. Nobody argued.

## Support

Hal wants a proper ticket sample for the fortnight after the mobile release
rather than his impression of it. Everyone said yes to that immediately, which
suggests we should have asked him for it before the release.

## Decisions

1. **Mobile second release scope is push reliability and camera roll upload, and
   nothing else.** Anything new goes on the Q4 list. Agreed by Sofia, Marcus,
   Ruth. Target stays 22 September.
2. **Filters ship behind a flag to five accounts first**, week of 17 August,
   before the 28 August date. Nadia proposed it, nobody objected. Sofia to pick
   the five with Elena.

## Actions

| # | Action | Owner | By |
| - | ------ | ----- | -- |
| 1 | Ticket sample for the two weeks after the mobile release, categorised | Hal | 22 July |
| 2 | Test plan for the compliance export, written before the writer is touched | Kenji | 21 July |
| 3 | Agree the five flag accounts with Elena | Sofia | Before 10 August |

## Other

- Ruth raised the header thing again and I did not write down the
- Marcus asked, again, whether anything on the Q3 page can come off it. Nobody
  volunteered anything. He said he would ask again in August and he will.
