# What actually forks by colour, and what does not

Dana Provenzano
2026-09-02

John asked me a question last week that I gave a bad answer to, which was
whether four colourways instead of six changes the panel order. The short answer
is no and the long answer is worth writing down, because everyone in this
company including me has been using the word panel to mean two different things
and one of them costs $440 and the other costs $56.

## Two things called panel

The display stack is four panels, one part number, and it is the same part
number in every finish. It is 41 percent of the bill of materials and it does
not know what colour the phone is. The module vendor has never been told our
colourway names and never needs to be.

The Suwon film is the other thing people call the panel, and this is where I got
it wrong myself until August. It is not a small window over the display. The
hard coat and anti-fingerprint stack covers the whole outer face and the rear
cover, so it goes over the colour layer everywhere, including the anodised frame.
That is why a decision about a display material was able to kill a frame colour.

Bellows does not fork either. Three hinges, one part number, 14 percent of the
bill of materials, and the cam profile does not care about oxide red.

| | Per unit | Forks by colour |
| --- | --- | --- |
| Display stack, four panels | $440 | no |
| Hinge assembly | $156 | no |
| SoC, memory, camera, battery, RF | $313 | no |
| Shell and frame, anodised | $62 | yes |
| Outer skin, tinted film plus coating stack | $56 | yes |
| Labour, test, warranty, freight, scrap | $113 | no |

$118 of $1,140 forks by colour. About ten percent. Ninety percent of what we buy
is the same box of parts whether we ship one finish or nine, and that is the
sentence I should have said to John instead of the one I did say.

The two lines that do fork are not independent, which is the part that keeps
catching people. The anodising happens at the shell vendor and the coating
happens at Suwon, and Suwon's stack goes on top of the shell vendor's colour.
Two vendors, one finish, and neither of them can sign off a colourway alone.

## Why Tide died and Rust did not have to

Worth putting the measurement in a document, because it keeps being described as
a taste call.

The Meniscus-C coating stack has a b* of +1.9. The UTG-3 glass stack we walked
away from on 27 August was +0.2. On a near black, a warm white, a deep green or
a copper, +1.9 of yellow is nothing and no observer picked it. On a pale blue it
is the entire shade. Tide measured delta E 2000 of 4.6 against its master
swatch, 3.1 of that in b*, against a 1.5 gate. The cast is inherent to the
anti-fingerprint chemistry rather than a process fault, so there was nothing to
fix and no supplier to lean on.

Rust is a different story and I want it recorded as a different story. Oxide red
needs a second anodising pass. A second pass takes a slot on the same line as a
first one, there are nine passes in the window, and six finishes needed eleven.
Rust was arithmetic. If the anodising booking had been eleven instead of nine we
would be shipping five colours today.

## The part that worried me for a week

Suwon quote SAF-Q-26-2288 prices in quantity bands.

| Quantity band | Unit price |
| --- | --- |
| 1 to 24,999 | $68.10 |
| 25,000 to 99,999 | $56.00 |
| 100,000 to 249,999 | $50.30 |
| 250,000 and above | $44.80 |

The cost model uses $56.00, which is the pilot band. The first quarter needs
187,200 pieces, which is 180,000 devices plus the 4 percent lamination scrap
allowance, and 187,200 sits comfortably in the $50.30 band.

Except the quote says the band applies to a part number, and a tinted film is a
part number. Four finishes is four part numbers.

| Finish | Pieces, including scrap | Band on the part number reading | Unit price | Extended |
| --- | --- | --- | --- | --- |
| Ink | 70,975 | 25,000 to 99,999 | $56.00 | $3,974,600 |
| Chalk | 50,050 | 25,000 to 99,999 | $56.00 | $2,802,800 |
| Moss | 41,803 | 25,000 to 99,999 | $56.00 | $2,340,968 |
| Ember | 24,372 | 1 to 24,999 | $68.10 | $1,659,733 |

| Reading | What we pay for the film, first quarter |
| --- | --- |
| Band counts the material, all finishes together | $9,416,160 |
| Band counts the part number, each finish alone | $10,778,101 |

$1,361,941 between the two readings, which is $7.57 a unit on a $56.00 line.

## The 628 pieces

Ember is 24,372 pieces. The band starts at 25,000. We are 628 pieces short.

| Ember order | Unit price | Extended |
| --- | --- | --- |
| 24,372 pieces | $68.10 | $1,659,733 |
| 25,000 pieces | $56.00 | $1,400,000 |

Ordering 628 more pieces of film costs $259,733 less than ordering 628 fewer. I
have read it four times and it is still true. The band is assessed on the order
quantity and $68.10 applies to every piece below the line, so the 628 pieces
are not the expensive part, the 24,372 behind them are.

It also fits. A run tops out at 26,000 pieces and Ember has one run, so 25,000
goes through the slot we already hold with 1,000 pieces to spare. The extra film
comes out as 603 more Ember devices, in the finish everyone agrees is the
hardest to forecast, on a plan where a second Ember coating slot is six weeks
away. So we buy 25,000 pieces, we pay less, and we get a buffer on the one
finish that has no other buffer available.

That move exists because Ember is close to a band edge. It was not available
before the 24 August review, when Ember was 17,576 pieces and 7,424 short, and
pushing it over the line would have cost $203,074 rather than saving a quarter
of a million. Splitting a fixed volume across more part numbers does not only
cost more, it takes away the move that recovers the cost.

## What the sixth colour would have done here

Same exercise on the plan we were carrying before the review. Six finishes at
the same 180,000 total puts Ember, Tide and Rust all in the bottom band.

| Plan | Film cost, part number reading |
| --- | --- |
| Six finishes | $10,926,157 |
| Four finishes, as forecast | $10,778,101 |
| Four finishes, Ember rounded to 25,000 | $10,518,368 |

## What I am doing about it

Asking Suwon the band question in writing, because a $1,361,941 ambiguity should
not survive a phone call. If they say the band counts the part number, I have
two moves. The first is to ask for the band to be assessed on the aggregate
across part numbers under one supply agreement, which is normal and which they
will probably give us because the material and the line are the same. The second
is the 628 pieces, which I am doing anyway. Under the expensive reading it saves
$259,733. Under the cheap reading it costs $31,588 and buys 603 devices of
buffer in the finish I have no other buffer for. I will take either.

The first move is free, so we try it twice before we settle for the second one.

## For John

Four things for the model.

The $56.00 in revision 7 is the pilot band and it is correct for the pilot build.
It is not correct for the first quarter, and depending on how the band question
lands the first quarter film line is either $50.30 or a mix of $56.00 and
$68.10. I would not change the model until Suwon answers.

The Ember order goes in at 25,000 pieces rather than 24,372 and I do not need a
decision on that, I need you to know it is deliberate before you find it in a
purchase order and think it is a typo.

The volume tier quote you have been asking for since 17 August is the same
conversation as the band question, so treat them as one open item rather than
two.

The colour fork is ten percent of the bill of materials and the panel line is
not part of it. If anyone asks whether the colourway decision moved the panel
order, the answer is that it never could have.
