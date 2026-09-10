# Retail display units

| | |
| --- | --- |
| Owner | Maya Restrepo |
| Status | In progress |
| Last edited | 2026-09-07 |
| Tags | retail, display, carriers |

## What a display unit is

A powered fixture on a carrier store counter holding one live Fold S1 on a
tether, next to a printed card. A person walks up, picks it up, folds it, puts
it down. That is the whole product.

Two hundred and forty units across the five tier 1 markets. The split between
Alder and Birch stores is still moving and the carriers have not given us final
counts, so treat 240 as the number we are building to and not the number we
have committed.

## The problem nobody had on the last phone

A display unit gets handled a few hundred times a day by people who did not pay
for it. On a slab phone that means fingerprints. On ours it means three hinges
taking a full open and close from someone who has read that folding phones
break and wants to find out how.

Our hinges are specified for 200,000 cycles across a two year life, which is
about 270 folds a day. A display unit in a busy store will beat that rate and
the folds will be worse than the ones the spec assumes. People do not open a
folding phone the way the test rig does. They open the outer hinge and then
lever the other two, they twist it, they open it halfway and let go, and a
surprising number of them try to fold it the wrong way to see what happens.

We are not going to fix the customer. We design the fixture so the hostile
version of the interaction is harder to reach than the good one.

## Fixture decisions

| Decision | What we chose | Why |
| --- | --- | --- |
| Resting state | Tablet, not folded shut | The first action becomes opening further, not prying apart |
| Tether | Centre panel, behind hinge 2 | A tether on an end panel becomes a lever |
| Tether length | Short enough to keep the device over the counter | Dropped units are the failure we see most in stores |
| Card | Beside, not behind | A card behind the device gets knocked every time |
| Charging | Through the fixture, contactless pad in the base | A cable in a hand is a cable pulled out |
| Swap policy | Store staff can swap a device in under a minute | Nothing on the counter should need a visit |

The tether point is the one to argue about if anyone wants to argue. A tether
anchored at the centre means the device pivots around its own middle hinge
rather than around a fixed end, and both outer hinges see something closer to
the motion they were designed for.

## Rotation and spares

Assume display devices are consumables. Each store gets its unit plus a spare
in the back, and we plan a swap partway through the first quarter rather than
discovering the need for one through a carrier complaint.

That has a consequence people keep missing. A display device that has been
folded by strangers for six weeks is a device with a visible crease and a
scuffed frame. It is the unit a journalist walks past, and it is also the unit
a customer compares to the render. We would rather swap on a schedule than have
that conversation.

## Which colourway is on the counter

Ink on the display unit. It is the lead finish, it is the one in every render,
and a person who has seen the campaign should find the same object in the shop.

Chalk goes on the card as the second image because Chalk shows the crease least
of the four, and the card is where a still photograph does its work. That is not
a trick. It is the same reason we shoot the hero on Ink and shoot the crease
explainer on Chalk.

Moss and Ember appear on the card as swatches only. Ember in particular appeals
to a narrow group who then buy it at a high rate, so the job of the card is to
tell the person who wants it that it exists.

## Accessories on the fixture

The folio case and the desk stand both need to be on the counter and neither
should be tethered to the phone.

The desk stand is the harder merchandising problem, because the stand only
demonstrates anything if the device is set into it and switches to the desk
state on its own. That is the moment worth showing. If the detection is
unreliable in a store, the stand becomes a piece of moulded plastic sitting next
to a phone and we would be better off not putting it out. Ben has that open on
the software side.

## Open

- [ ] Final unit counts from both carriers
- [ ] Fixture drawings back from the display vendor
- [ ] Decide whether the desk stand goes on the counter at launch or waits
- [x] Resting state agreed as tablet
- [x] Tether anchored at the centre panel
- [ ] Store staff swap procedure, written, one page, with pictures
