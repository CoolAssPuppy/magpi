b7 postmortem. MY version. started 31 aug, last touched 4 sept 2026. do not
publish this one

the published one is fine. it is accurate. it says what happened, when, and
what we changed, and every line in it is true

it is also written the way you write a thing that is going in front of people,
and the actual failure is not in it

what actually happened

12 aug. we chose UTG-3. the inputs were: vendor cycle claim, a clean a-series
sample at 120k, a hardness number, and my recommendation

the vendor cycle claim was measured at a 4.0mm bend radius. we bend at 3.2mm.
that is in the datasheet, in the first table, as the column header

so why did I not see it

honest answer, in order of how much I want it to be true

a. the radius column was there and I read the cycle number, because the cycle
number was the thing I was looking for and it was bigger than 200k
b. I was running three programmes and the display one was the one where I was
furthest behind
c. jane needed a material choice that week for the tooling schedule and I knew
it and I gave her one
d. I wanted it to be glass. it feels better. every person who picks up a glass
unit and then a polymer unit prefers the glass one, seven of nine in my own
blind ranking, and I am one of the nine

(d) is the one. it is always (d). the rest are how you get to (d) without
noticing

the external coupon report

commissioned in july, arrived 17 aug, sat in my folder until the 30th

characteristic life 214,000 at our radius. I would have read that on the 18th
and felt fine. the B10 is 118,000 cycles. eleven of twelve coupons, one
excluded for an edge chip, and the tenth percentile is 118,000

a device that fails for one user in ten inside the warranty period is a
recall, whatever the distribution looks like written down

and the lab wrote a whole paragraph telling us that. "the client is advised
that a design target expressed as a mean life is not appropriate for a material
with this distribution". they wrote that FOR ME. it is the politest sentence
anyone has ever aimed at my head

so the real failure sits underneath the datasheet misread. we have no rule
about who reads vendor data, how, and what has to come out of it before a
material goes into a decision record. one person
reads it, that person is me, and there is no second reader on anything

what a fix would look like

1. component selection page gets a datasheet reading rule. every vendor number
   we quote carries the test condition it was measured at, in the same row.
   no condition, no number
2. any life claim gets a distribution or it gets treated as unqualified. mean
   life alone is not an input to a decision
3. second reader on any material that goes in a decision record. ben would do
   it. ben would enjoy it, which is worrying and also useful
4. external reports get read within 48 hours of arrival or they get
   acknowledged as not read, in writing, by me

what I have actually done about it

opened the checkbox on the b7 page for the datasheet reading rule. it is still
unchecked. it has been unchecked for eleven days

what I want to say to the team and probably will not

that reversing on 27 august was the only decision left by then, and calling it
a good decision flatters all of us. the good decision was on 12 august and we
did not make it, and the reason we look fast and decisive is that john happened to
notice a tooling deadline on a wednesday. if the commit had been three weeks
out we would have taken three weeks and I would still be telling people the
distribution is wide but the mean is fine

what would have caught this earlier, actually caught it, not in hindsight

the a-series only ran to 80k. we knew that. I said it in the offsite, out loud,
in front of everyone, that the cycle data was incomplete and I was not
comfortable with how confident the room sounded. and then I went back to the
lab and kept running the same test instead of

[stops here]
