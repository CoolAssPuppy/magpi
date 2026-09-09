# #billing, 8 June 2026

Thread started by Marcus Ilic at 09:41.

**Marcus Ilic** (09:41)
June review on the billing rebuild. Priya, Jonah, Ade, and me. Diane is on a
plane so I will write up whatever we land on and send it to her.

Starting position is the March record. We decided to keep the billing service
and rebuild it. Three reasons: our model does not fit a subscription product,
the mid cycle rule is ours, and Jonah owns the code.

**Marcus Ilic** (09:42)
All three have moved.

**Priya Raman** (09:48)
Taking them in order.

Model does not fit. What we wrote down was eleven accounts with a negotiated
allowance and six with an annual commitment. Seventeen of 214. I checked this
morning, it is now thirteen and six. The general case fits fine. We built for
the exception.

**Priya Raman** (09:49)
Mid cycle rule. We do not prorate the shipment allowance on upgrade. That is
one rule and we can express it as a one off invoice item on the transition. It
does not need a ledger.

**Priya Raman** (09:50)
Jonah owns the code. Jonah is on the search team from July.

**Jonah Kestrel** (09:52)
Correct on all three. I will add that the five or six weeks I estimated in
March is nine weeks and counting and I have spent most of it on BIL-198,
BIL-201 and BIL-204 rather than on the rewrite I was estimating.

**Ade Fashola** (09:55)
And a day and a half of my month, every month, hand checking a run.

**Marcus Ilic** (10:03)
So. Proposal. We reverse the March decision. Move plan fees and seat counts to
Stripe subscriptions. Keep the trueup as ours, because the shipment count comes
out of our database and always will, and post it as a monthly invoice item
against the Stripe subscription rather than against our own ledger.

Delete the proration logic. Delete the ledger. Keep the reconciliation report
because Ade actually uses it.

**Priya Raman** (10:05)
Yes. And to be clear about what we are giving up: the seventeen exception
accounts get handled by hand for a while. Thirteen negotiated allowances become
a custom allowance value we store on our side and feed into the trueup, which
is fine. The six annual commitments paid monthly are the awkward ones and I do
not have a clean answer for them yet.

**Ade Fashola** (10:07)
Six accounts I can do by hand. I already do four of them by hand.

**Jonah Kestrel** (10:09)
Worth saying out loud that March was not a stupid decision. We had a person who
knew the code and a model we believed was unusual. Both of those turned out to
be less true than we thought, and one of them stopped being true because I
changed teams.

**Marcus Ilic** (10:14)
Agreed, and I want that in the writeup rather than a note that says we were
wrong in March. We were wrong about how narrow the constraint was.

**Marcus Ilic** (10:15)
Decision: reverse. Move to Stripe subscriptions for plan and seats. Trueup
stays ours. Target is the October billing run, which gives us Q3.

**Marcus Ilic** (10:16)
Owner for the trueup rewrite and the migration is Priya. Jonah writes the
handover before he moves and pairs with her on the ledger teardown.

**Priya Raman** (10:16)
Taking it.

**Priya Raman** (10:22)
I will open the epic today. `BIL-241` for the migration itself. BIL-204 stays
open until the June run is clean because we still need the fix in the code we
are about to delete.

**Hal Winters** (11:40)
Coming in late. Does this change anything a customer sees on an invoice?

**Priya Raman** (11:44)
Line items get slightly different names. The plan fee line will say the
subscription name instead of "Portside Standard, monthly". Overage line is
unchanged. We will send a note before the October run.

**Hal Winters** (11:45)
Fine. Send it to me first, I will put it in the help centre the same day.

**Elena Vargas** (13:02)
Does this touch the annual customers before renewal

**Priya Raman** (13:10)
Not before renewal, no. Those six stay exactly as they are and we move each one
at its own renewal date.

**Elena Vargas** (13:11)
ok good
