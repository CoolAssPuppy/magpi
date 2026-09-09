# EDI 214 field notes

Kenji Mori
Started 5 March 2026, added to since

These are my own notes, not documentation. I keep rebuilding the same
understanding of the 214 every time I go near the parsers and I am tired
of doing it from scratch. If you are reading this because I sent you the
link, the useful parts are "the codes we actually care about" and "edge
cases".

## Why this file exists

We run two parsers for EDI 214 shipment status messages. The current one
was written in 2024 and handles everything except the variant. The
legacy one was written in 2021 and exists for seven accounts whose
trading partners still emit an older segment order that the current
parser rejects outright.

Every few weeks something arrives that neither parser handles cleanly,
I spend an afternoon in a hex dump, and then I forget the shape of it.
So: notes.

## The envelope, the short version

A 214 arrives inside the usual interchange envelope. From the outside
in:

```
ISA  interchange control header, fixed width, 16 elements
GS   functional group header, group code QM for shipment status
ST   transaction set header, ST*214*0001
B10  beginning segment: our reference, the shipper's reference, SCAC
L11  reference numbers, repeats, this is where the load reference lives
MS3  routing, carrier
N1   name loop, N3 and N4 for address, repeats per party
LX   detail loop, one per stop or status event
AT7  shipment status details: status code, reason, date, time, zone
AT8  weight and quantity for that event
MS1  location, city and state or postal code
SE   transaction set trailer, segment count and control number
GE   functional group trailer
IEA  interchange trailer
```

Everything interesting to us is B10, L11 and the AT7 inside each LX
loop. The rest we store and mostly do not read.

Real fragment, cleaned of the account identifiers, from a partner who
sends a well formed message:

```
ST*214*000000101~
B10*5218*MRC88213*ALDW~
L11*AB7*BM~
L11*MRC88213*CN~
N1*SH*NORTHGATE FOODS~
N4*LEEDS**LS11 5AA*GB~
LX*1~
AT7*X3*NS***20260304*0812*LT~
MS1*LEEDS**GB~
LX*2~
AT7*AF*NS***20260304*0947*LT~
MS1*LEEDS**GB~
LX*3~
AT7*X1*NS***20260304*1631*LT~
MS1*DONCASTER**GB~
SE*13*000000101~
```

Read that as: shipment 5218, their reference MRC88213, load reference
AB7 in an L11 qualified BM. Arrived at pickup at 08:12, departed at
09:47, arrived at delivery at 16:31. Three events, one message, sent at
the end of the day. That is the easy case and about two thirds of our
volume looks like it.

## The codes we actually care about

AT7 carries a status code in the first element and a reason code in the
second. There are far more codes in the guide than anybody sends. These
are the ones that reach Portside in real traffic and what we do with
them.

| Code | Means | Portside status |
| ---- | ----- | --------------- |
| X3 | Arrived at pickup | In transit, arrived origin |
| CP | Completed loading at pickup | In transit |
| AF | Departed pickup with shipment | In transit |
| X4 | Departed a location | In transit |
| X6 | En route to delivery | In transit |
| X1 | Arrived at delivery | In transit, arrived destination |
| D1 | Completed unloading at delivery | Delivered |
| CD | Carrier departed delivery location | Delivered |
| AG | Estimated delivery | No status change, updates the ETA field |
| AH | Attempted delivery | Exception |
| AP | Delivery not completed | Exception |
| A9 | Shipment damaged | Exception |
| CA | Shipment cancelled | Cancelled |
| SD | Shipment delayed | Exception |

Two things about that table that took me longer than they should have.

First, X1 means the truck is at the gate. D1 is the one that means
delivered. We got this wrong in 2022, marked things delivered on
arrival, and a customer noticed because their detention clock started
from the wrong event. The clock runs from arrival, so X1 matters
enormously to a dispatcher and it is still not a delivery.

Second, the reason code in the second element is usually NS, which means
normal status, and it is easy to write code that ignores it. Do not
ignore it. On an AH or an AP the reason code is the whole message. AH
with reason code A1 is "missed appointment" and AH with reason code BB
is "receiver closed", and those two go to different people at the
brokerage.

## The variant, and what the seven send

The seven accounts on the legacy parser send messages that are valid
under an older implementation guide their trading partners never left.
The content is the same. The order is not.

What differs, in the order it bites:

**L11 placement.** The current guide puts all L11 reference segments in
the header, before the first LX. The older guide allows L11 inside the
LX loop, attached to the event rather than to the shipment. Several of
the seven put the load reference in a loop level L11 and send nothing
in the header. Our current parser reads the header, finds no reference,
and cannot match the message to a thread.

**MS1 before AT7.** The older guide puts the location segment ahead of
the status segment in the loop. The current one puts AT7 first. Both are
readable, and the current parser has a strict positional check that
fails on the first one.

**N1 loop after the LX loops.** Two of the seven send the party names at
the end of the transaction set rather than the top. Legal under the old
guide, and it means you cannot know who the consignee is until you have
read the whole message.

**Q5 instead of MS1.** One account sends status location as a Q5 segment,
which the older guide permitted. We special case this in the legacy
parser and it is the ugliest twenty lines in it.

Fragment from one of the seven, same shipment shape as above:

```
ST*214*000000044~
B10**HAL0092211*HLVN~
LX*1~
MS1*IMMINGHAM**GB~
AT7*X3*NS***20260304*0806*LT~
L11*HAL0092211*CN~
L11*AB7*BM~
LX*2~
MS1*IMMINGHAM**GB~
AT7*AF*NS***20260304*0931*LT~
L11*HAL0092211*CN~
L11*AB7*BM~
N1*SH*HALVORSEN CARRIERS~
SE*12*000000044~
```

Note B10 with an empty first element, the references repeated in every
single loop, and the shipper name arriving last. All of that is legal
under the guide they are working to. None of it is what the current
parser expects.

The plan in `EDI-81` is a tolerant segment order mode behind a per
connection flag, then delete the legacy path. The engineering is about
two weeks and most of that is test fixtures built from real message
samples these seven have already sent us. The blocker on `EDI-81` is not
engineering and I am not going to restate it here, it is written up in
the issue.

## Why two of them time out

This is `EDI-77`. Marchetti Freight and Brody and Sons.

The legacy parser resolves references by scanning. For each AT7 it walks
back from the current position to the start of the transaction set
looking for the nearest L11 with a BM or CN qualifier. That was a
reasonable thing to write in 2021 when the messages had four loops in
them.

Both of these accounts batch. Marchetti sends one transaction set at
end of day covering every stop on every load their partner touched, and
a busy Monday is upward of nine hundred LX loops. Brody and Sons send
per shipment but their partner emits a status event for every gate
scan, and a multi stop run produces a couple of hundred loops with
references repeated in each.

Scanning back from every AT7 over a message that long is quadratic. On
top of that the reference matcher is a regular expression with a
nested quantifier in it, so on the repeated L11 blocks it backtracks
badly. The two things multiply.

Measured on a copy of a real Marchetti Monday message: 41 seconds, which
is past the 30 second job timeout, so the job is killed and retried, and
the retry does exactly the same thing. The customer sees status messages
that arrive the following morning, or not at all if the retry budget
runs out.

Fixing it properly inside the legacy parser means indexing the L11
segments in one pass and rewriting the matcher, which is most of the
work of rewriting the parser we are trying to delete. Hence `EDI-77`
sitting where it is sitting.

Two workarounds are in place. Marchetti's connection has a raised job
timeout, which turns a failure into a slow success most days. Brody and
Sons have a batch splitter in front of the parser that cuts a
transaction set at 150 loops, which is safe for them because their
references are repeated per loop and nothing is lost by splitting. That
splitter would corrupt Marchetti, because their header level context
would be dropped from every chunk after the first.

## Edge cases I keep hitting

Written down so I stop rediscovering them.

- **Time zone element.** AT7 element 7 carries the zone. LT means local
time at the location, which means you cannot convert without knowing
where the location is, which means you need MS1 before you can resolve
the timestamp. When MS1 comes after AT7 in the variant, you have to
defer resolution to the end of the loop. We got this wrong for six
weeks in 2023 and every event from a US partner was an hour off in
summer.

- **Midnight rollover.** Date and time are separate elements. A message
sent at 00:04 reporting an event at 23:58 arrives with yesterday's
date and we have seen partners get this wrong and send today's. If the
resulting timestamp is in the future by less than two hours, we
currently accept it. That threshold is arbitrary and I picked it.

- **Duplicate events.** Partners resend. The same X1 for the same
shipment arrives twice, sometimes with a different control number and
the same content, sometimes with the same control number. We dedupe on
shipment plus status code plus timestamp to the minute. That is wrong
for an AH, because a genuine second delivery attempt at the same
minute of a different day is a different event, but same minute
same day is not.

- **Out of order events.** A delivery arrival can land before the
departure it follows, because two partners in the chain send
independently. Portside orders the thread by event time, not by
arrival time. This is correct and it confuses people, because a
message can appear above one that was already on screen.

- **Empty B10 first element.** Legal. Means match on the second element
or on an L11. Three of the seven do this.

- **Status code we do not map.** Currently we drop it and log. There are
maybe a dozen codes a month that fall through, mostly rail codes from
one intermodal partner. Dropping is fine. Logging without an alert
means nobody has ever looked, and I looked in February for the first
time in a year.

- **SE segment count mismatch.** The trailer says how many segments were
in the set. When it disagrees with what we counted, the current parser
rejects. The legacy parser does not check at all. Neither behaviour is
obviously right and I would like the tolerant mode to warn rather than
reject, because in practice a mismatch has never once meant the content
was bad. It has meant somebody's generator counts the ST segment
differently.

- **997 acknowledgements.** We send them. If we reject a 214 we send a
997 saying so, and at least two partners do not read it, which is why a
customer can be sending us status messages for weeks that we have been
refusing the whole time. Worth an alert on our side. Not filed.

- **Character set.** One partner sends a tilde inside an address free
text field, which is also our segment terminator. Their generator does
not escape it. Every message from that partner has one extra phantom
segment in it and the SE count check catches it, which is the only time
the count check has ever earned its place.

## Things I want to check when I next have a day

- Whether the raised timeout on Marchetti is actually holding, or
whether we are just not looking at the retries.
- Count how many of the seven put the load reference only in a loop
level L11. My memory says four. My memory has been wrong about this
before.
- Whether the batch splitter in front of Brody and Sons has a maximum
message size guard on it, because I do not think it does.
- Write the fixture set. Every argument about the tolerant mode ends
with somebody asking whether a real message looks like that, and the
answer should be a file, not me.

## Added 14 August

`EDI-81` is filed now and it carries the customer list and the
sequencing. This file stays technical. Anything about timing or notices
lives in the issue and not here, so there is one copy of it.

One correction to the notes above. It is five of the seven that put the
load reference only in a loop level L11, not four. I checked against
three months of stored raw messages rather than against my memory.
