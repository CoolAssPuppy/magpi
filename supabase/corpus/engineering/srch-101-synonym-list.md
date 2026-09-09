# SRCH-101 Synonym list for freight terms in search

Team: Search
Status: Done
Priority: Medium
Assignee: Jonah Kestrel
Labels: search, ranking
Created: 2026-07-30
Completed: 2026-08-26
Estimate: 3
Cycle: Cycle 35
Related: SRCH-95, SRCH-88

## Description

Somebody types POD and gets nothing, because every thread in the account says
proof of delivery. Somebody types bill of lading and misses the eleven threads
where the dispatcher wrote BOL. The two forms are the same word to a human and
two unrelated lexemes to `to_tsvector`.

Fix is a Postgres synonym dictionary in the text search configuration used by
`thread_search_refresh` and by the query parser, so both sides map to the same
lexeme. Abbreviation goes to the expansion, not the other way round, because the
expansion is what tends to be in the older threads.

Starting list, taken off the glossary and off two months of query logs:

```
pod             proof of delivery
bol             bill of lading
b/l             bill of lading
ratecon         rate confirmation
rate con        rate confirmation
mc              mc number
scac            carrier code
ltl             less than truckload
ftl             full truckload
otr             over the road
reefer          refrigerated
dh              deadhead
acc             accessorial
det             detention
dem             demurrage
appt            appointment
cons            consignee
poc             point of contact
eta             estimated arrival
```

Two of these are known to be wrong in some accounts and are in anyway. `dem` is
demurrage to most customers and a carrier's initials at one. `cons` is consignee
in six accounts and consignment in one. A synonym that is wrong for one account
costs that account a few extra results. A missing synonym costs every account the
thread they were looking for.

Multi word expansions need the phrase side handled at query time, because a
synonym dictionary maps one token to one token. So `rate con` is normalised in
the query preprocessor in `search/query.ts` before the text search runs, and only
the single token cases go in the dictionary file.

## Comments

**Jonah Kestrel, 30 July**

First search issue, so tell me if I have filed this at the wrong size.

The thing that surprised me reading the query logs is how many searches are two
or three characters and nothing else. Somebody types POD and stops. They are not
composing a query, they are asking for the paperwork. That was not what I
expected search traffic to look like coming off billing, where every input is a
number that means exactly one thing.

**Nadia Osei, 31 July**

Right size. Two notes, one of them the boring one about where a file lives, and
the boring one is the one that will bite us.

Postgres wants the synonym dictionary as a file in `$SHAREDIR/tsearch_data` on
the database host. If you put it there by hand it will be correct until the next
time the host is rebuilt, and then it will be gone and search will quietly start
missing again, and it will take somebody a week to work out why. So the file
lives in the repo at `search/dict/freight.syn`, and it is installed by the same
deploy step that runs migrations. Kenji already has a hook for this. The file in
the repo is the only copy that counts.

Second note, ownership. This list is going to grow forever and most of the
additions will come from Hal, because he is the one reading the ticket where
somebody typed an abbreviation we do not know. The list is owned by search, which
means me and now you, and the process is that anyone opens a pull request against
`freight.syn` and one of us reads it. Not a Notion page. Not a spreadsheet Ade
maintains. A file, in the repo, with a diff and a name on it.

The reason I care is that we tried the spreadsheet version of this in 2024 for
carrier name aliases and by the time anyone looked at it, it had 90 rows and 30
of them had never been loaded into anything.

**Jonah Kestrel, 31 July**

Repo it is. I will add a line to the search README about how to add one.

**Hal Winters, 12 August**

Four more from this week: `wh` for warehouse, `del` for delivery, `pu` for
pickup, and `bko` which is one account's own abbreviation for a backorder and
probably should not go in.

**Nadia Osei, 12 August**

First three yes, `bko` no. Open the PR and I will read it today.

**Jonah Kestrel, 26 August**

Shipped with the filters release. Reindex of all accounts ran overnight, four
hours, no incidents. `pod` now returns proof of delivery threads and I have
checked that against six accounts by hand.
