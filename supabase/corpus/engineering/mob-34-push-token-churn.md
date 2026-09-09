# MOB-34 Push tokens go stale and notifications stop silently

Team: Mobile
Status: In Progress
Priority: High
Assignee: Ruth Adeyemi
Labels: mobile, reliability, customer-impacting
Created: 2026-08-18
Estimate: 5
Cycle: Cycle 36

## Description

People stop getting push notifications and nothing tells anybody. Not the person,
not us. The app looks fine. The setting is still on. Threads they follow update
and the phone stays quiet.

Eleven tickets since the July release, all the same shape: it worked for a while
and then it stopped. Two of them we could only confirm by asking the customer to
reinstall, which fixed it, which is the tell.

## What is happening

We register a device token once, at login, into `device_token`:

```
device_token(id, account_id, user_id, platform, token, created_at)
```

There is no `device_id`, no `last_registered_at`, and no unique constraint except
on `token` itself. Registration happens in one place, `mobile/src/auth/login.ts`,
on a successful sign in and nowhere else.

Tokens do not stay still. They rotate on reinstall, on restore from a device
backup, when the app is unused long enough that the OS reclaims the registration,
and on some OS upgrades. A person who logged in once in July and has not logged
in since is holding a token we no longer have, and we are holding a token nobody
is listening to.

The send path makes it silent. `services/push/send.ts` posts to the provider and
logs the HTTP status, and it treats anything that is not a 5xx as delivered:

```
[push] send thread=thr_88c1 user=usr_2d47 token=a91f status=410
[push] batch complete sent=142 failed=0
```

410 is the provider saying that token is dead and stop using it. We count it in
`sent`. So the dashboard shows a healthy delivery rate, support gets a ticket
about a phone that has gone quiet, and there is no line anywhere that connects
the two.

Third thing, smaller. Logout does not delete the row. A shared yard phone that
two people sign into ends up with both tokens live and the same rows never
cleaned up.

## Plan

1. Add `device_id` and `last_registered_at` to `device_token`, unique on
   `(user_id, device_id)`. The device id is generated once on first run and kept
   in the keychain, so it survives a token rotation. Replace by device, not by
   token, which is what fixes the duplicate rows.
2. Register on every cold start, and on foreground if `last_registered_at` is
   more than 24 hours old. Registration is idempotent and cheap.
3. Subscribe to the provider's token rotation callback and re-register from it,
   which catches the case where the app is not opened for weeks and then is.
4. Delete the row on logout.
5. Treat 410 and the provider's UNREGISTERED response as a delete, not a
   delivery. Count them separately, `sent`, `failed`, `expired`.
6. Alert on the ratio. If expired goes above five percent of a batch, page
   somebody, because the only way that happens is a registration path breaking.
7. Backfill: mark every existing row `last_registered_at = null`. Those devices
   re-register on their next cold start and the ones that never come back get
   swept after 30 days.

## Open questions

- Whether a token that has not registered in 30 days should show the person a
  banner telling them notifications are off. It is honest and it is also a banner
  about a thing they cannot fix by themselves.
- Whether the sweep should delete or just mark. Leaning mark, because a deleted
  row loses the fact that this user once had a working device.

## Comments

**Ruth Adeyemi, 18 August**

This is the risk I wrote into the mobile scope document in June, which said push
would be the first thing to break and the second release would mostly be about
it. The reason I knew is that everybody who has shipped push says that same
sentence. We shipped it anyway with one registration call, on a July date I set
myself, and that is the part worth recording.

**Hal Winters, 19 August**

The silent part is what costs me. A person whose notifications are broken does
not open a ticket saying notifications are broken. They open a ticket in October
saying they missed a load, and by then nobody can prove anything.

If the alert in point six exists, tell me what it looks like when it fires, so I
know whether to warn anyone.

**Ruth Adeyemi, 19 August**

It fires into `#eng` and I will make sure the message names the accounts affected
rather than just a percentage.

**Ruth Adeyemi, 2 September**

Migration and the client changes are in. Provider callback is done on one
platform and half done on the other.

First run of the expired counter against real traffic: of 1,180 registered
devices, 214 return 410 immediately. Those people are getting no notifications
today and have not been for weeks. They all re-register on the next cold start
after the September release. I would rather not think about how long it would
have stayed invisible.
