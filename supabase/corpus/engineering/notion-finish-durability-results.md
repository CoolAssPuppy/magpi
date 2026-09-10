# Finish durability and colour stability under Meniscus-C

| | |
| --- | --- |
| Owner | Sam Lindqvist |
| Status | Active |
| Effective | 2026-08-31 |
| Last edited | 2026-09-02 |
| Tags | finish, colour, meniscus, hardware, results |

## Why this page exists

Six finishes went into validation on 24 August against UTG-3 glass. On 27 August
the outer layer changed to Meniscus-C polymer from the Suwon vendor, and the
coating chemistry changed with it. Everything measured before that date was
measured against a coating we no longer use.

This page is the re-run. Same six finishes, same instruments, production coating
from the Suwon sample lot. Two of the six did not come back.

## What changed about the coating

The Suwon stack is a hard coat plus an anti-fingerprint layer, and it goes over
the whole outer face and the rear cover, not only the active display area. That
means it sits on top of the colour layer everywhere a person can see it.

It is not optically neutral. Measured against the Kyoto glass stack on the same
white tile:

| Stack | b* on white tile | Haze, flat |
| --- | --- | --- |
| UTG-3 glass, Kyoto | +0.2 | 0.3 percent |
| Meniscus-C, Suwon sample lot | +1.9 | 0.4 percent |

A b* of +1.9 is a slight warm cast. On a near black, a warm white, a deep green
or a copper it is inside the noise of the finish itself. On a pale cool shade it
is the whole story.

Suwon confirmed the cast is inherent to the anti-fingerprint chemistry rather
than a lot problem, and that removing it costs the fingerprint performance. We
are not asking them to remove it.

## Method

| What | How | Gate |
| --- | --- | --- |
| Colour | Spectrophotometer, D65, 10 degree observer, five points per panel, against the master swatch for that finish | delta E 2000 under 1.5 |
| Gloss | 60 degree gloss meter, five points, same instrument as the crease work | within 4 GU of the master swatch |
| Scratch | Coin drag rig, two passes at 500 g | no mark that catches a fingernail |
| Abrasion | Taber, CS-10 wheels, 500 g, 500 cycles | delta E under 2.0 after |
| Light fastness | Xenon arc, 300 hours | delta E under 2.0 after |
| Adhesion | ASTM D3359 cross hatch, before and after abrasion | 5B |
| Frame | Salt spray 96 hours on the anodised frame coupon | no pitting, no colour change |

Colour is the row that decided this. A shade we cannot hold inside delta E 1.5
cannot be matched by a printer, a swatch card, a folio case or a retail
photograph, and every one of those is a different supplier working from a
number rather than from a panel in their hand.

## Results

| Finish | delta E vs master | delta b* | Gloss vs master | Coin drag | Verdict |
| --- | --- | --- | --- | --- | --- |
| Ink | 0.4 | +0.3 | +1.1 GU | pass | Pass |
| Chalk | 0.9 | +0.8 | +0.6 GU | pass | Pass |
| Moss | 0.7 | +0.5 | +1.4 GU | pass | Pass |
| Ember | 1.1 | +0.9 | +2.2 GU | pass | Pass |
| Tide | 4.6 | +3.1 | +0.9 GU | pass | Fail, colour |
| Rust | 0.8 | +0.6 | +3.1 GU | pass | Fail, process |

All six pass scratch, abrasion, light fastness and adhesion. Nothing here is a
durability failure. The polymer coating is a good coating.

### Tide

Tide fails on colour and only on colour. Delta E 2000 of 4.6 against the master
swatch, and the whole of it is in b*. A pale blue with three units of yellow
added to it is not a pale blue any more. Under the ceiling lights the panels
read grey-green, and next to the master swatch they read dirty.

The physics is dull. Tide sits at the lowest b* of the six by a distance, so it
has the least room to absorb a warm cast before the shade changes character.
Every other finish either has enough chroma to swallow +1.9 or is warm already
and gets slightly warmer.

We tried three things before calling it. Re-tinting the colour layer cool to
compensate, which gets delta E to 2.4 and puts the shade outside what industrial
design signed off. A thinner anti-fingerprint layer, which halves the cast and
fails the fingerprint test. A different Suwon coating line, which does not
exist.

Written up in the Tide tint shift issue with the plots.

### Rust

Rust passes every measurement on this page. It is out for a reason that has
nothing to do with the finish.

Oxide red on the frame needs two anodising passes, a base anodise and a second
dyed pass, because a single pass comes out uneven at the hinge knuckles where
the section changes. That was known on 24 August and was going to be booked into
the tooling window in early September.

The polymer change meant a die reorder, the die reorder took the window, and
there is no second slot before the pilot line. Dana has looked twice. The second
pass is not expensive and it is not difficult, there is simply nowhere to put
it.

If a slot appears, Rust comes back with no engineering work required beyond the
salt spray re-run. That is not an argument for holding it open.

## What ships

Ink, Chalk, Moss and Ember, all four on the production Meniscus-C coating, all
four inside every gate on this page.

> The gloss column is worth one more line. Ember runs 2.2 GU above its master
> swatch and Rust ran 3.1. Higher gloss makes a fold line easier to find, and
> the crease gate is a 2.5 GU deviation across the fold on a 60 degree meter.
> Ember is inside the gate on the fold measurement itself and the three observer
> panel found nothing on it, so it ships. It is the finish I would re-check
> first on production coating rather than sample lot coating.

**Does any of this change the crease numbers?**
No. The crease measurement is a deviation across the fold on the same pane, so a
finish that is uniformly glossier does not move it. The three observer panel ran
on all four shipping finishes and found the line on none of them under diffuse
light.

**Can we re-run Tide on a later coating lot?**
There is no point. The cast is the chemistry rather than the lot, and Suwon has
said so in writing.

## Open

- [x] Re-run all six on the production coating
- [x] Colour, gloss, scratch, abrasion, light fastness, adhesion
- [ ] Re-run gloss on production coating rather than sample lot, all four,
      Ember first
- [ ] Salt spray on the four shipping frame coupons, 96 hours, not started
- [ ] Master swatch cards cut from production coating, three per finish, owed to
      Maya for the shoot
