# The crease, what we measure and what a person actually sees

Ben Achilov
2026-09-04
Units B6 and B7 for glass reference, B11 and B12 for polymer
Related: ENG-205, ENG-218, GTM-15

## Why I am writing this and not Sam

Sam owns the crease as a mechanical problem and owns the gloss meter number
that goes in the vendor contract. I own the observer test, which is the part
that decides whether a person standing in front of the phone sees a line. Both
halves came out of ENG-205 and we argued about them for a week before Jane told
us to do both.

The reason this document exists now is that Priya and Maya have to answer a
question in public in a few weeks and they should answer it with our numbers
rather than with an adjective.

## What we measure

**Gloss deviation.** 60 degree gloss meter, five points across the fold line,
maximum deviation from the flat area of the same panel. The gate is under 2.5
GU and that number is in the vendor contract, so it is the one with money
attached to it.

**The observer test.** 3000K diffuse panel at one metre. Three people. Eyes at
40 cm from the panel. The panel shows a flat 70 percent grey. Each person is
asked to point at any fold line they can find, without being told where to
look, and without being told how many there are. A single person finding a line
fails the internal gate for a release build.

**The point source case, which is not a gate.** A single hard lamp at a shallow
angle, moved by hand until the line shows or until the observer gives up. This
one is not repeatable and I have never been able to make it repeatable. It is
also the exact lighting in every product photograph and every hands-on table at
every event, so we run it anyway and I write down what happened rather than a
number.

## Results

| Unit | Material | Cycles | Gloss deviation, GU | Observers finding the line, of 3 | Point source |
| --- | --- | --- | --- | --- | --- |
| B6 | UTG-3 glass | 180,000 | 2.9 | 2 | Visible immediately, from across the room |
| B7 | UTG-3 glass | 180,000 | fractured | 3 | Not applicable, the panel is broken |
| B11 | Meniscus-C | 0 | 0.4 | 0 | Nothing found in four minutes |
| B11 | Meniscus-C | 50,000 | 0.9 | 0 | Faint, found only after being told where |
| B11 | Meniscus-C | 100,000 | 1.3 | 0 | Findable at about 45 degrees if you know |
| B12 | Meniscus-C | 100,000 | 1.2 | 1 | Findable at about 45 degrees if you know |

The one observer who found the line on B12 at 100,000 cycles is Dana, who also
found it on B6, and who has spent a month looking at incoming polymer lots
under raking light. I have recorded it as a find because it was one, and I want
it noted that the most sensitive pair of eyes in this building belongs to the
person who does this every day.

Haze is tracked separately in ENG-218 and is under our 1.2 percent spec at
every measurement so far.

## What this means in a sentence

At 100,000 cycles on polymer, nobody finds the fold line under office lighting,
and under a single hard lamp at the right angle a person who already knows
where it is can see it.

That sentence is true and I want it said in those words, because every shorter
version of it is either a boast or an apology.

## The photograph question

GTM-15 has to answer why a phone at this price does not use glass on the
outside, and GTM-12 has twelve reviewers coming in for hands-on sessions where
someone will ask about the fold line inside four minutes. I have taken the
point source photographs and put them in the Drive folder. They are honest
photographs and they show a line.

My view, which I have given to Priya and Maya and will not give again: hand the
photograph over with the cycle count next to it. A reviewer who finds it
themselves has made a discovery. A reviewer who is handed it with a number has
been given engineering, and the number is a good number.

## The thing I keep being asked

Three people have now asked me whether the compositor can hide the crease.

It cannot. There is no software fix for a physical fold. Ori can avoid putting
a hard vertical edge along a fold line in the default layouts, which we already
do because it looked bad, and that is the entire extent of what software can
contribute here.

## Next

- B11 and B12 continue to 200,000 and I re-run both tests at the end.
- The observer test moves into the firmware release checklist so a release
  build cannot go out without it.
- Sam re-runs the gloss meter on the first pilot line lot, because a fold line
  from a production lamination is a different question from a fold line on a
  unit we built by hand.
