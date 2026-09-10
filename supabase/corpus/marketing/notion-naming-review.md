# Naming review

| | |
| --- | --- |
| Owner | Priya Raghunathan |
| Status | Decided |
| Decision date | 2026-09-08 |
| Last edited | 2026-09-08 |
| Tags | naming, marketing, decision |

## The question

We have three internal names that everyone here uses fifty times a day. Meniscus
for the outer display layer, Bellows for the hinge assembly, Ori for the shell.
They are good words. The question was whether any of them should be public.

> **Decision.** Meniscus, Bellows and Ori stay internal. No customer, reviewer
> or carrier ever sees them. The product name is Fold S1 and the parts do not
> have public names.

## Options

| Option | What it buys | What it costs | Verdict |
| --- | --- | --- | --- |
| Keep all three internal | Nothing to explain, nothing to trademark, no confusion | We lose a hook for the hinge story | Selected |
| Make Bellows public | A named hinge is a competitive marker | Trademark work, and a name we would have to defend | Rejected |
| Make Ori public | Software gets an identity of its own | It implies a platform we are not shipping | Rejected |
| Make all three public | A house of names | Seven people cannot maintain four brands | Rejected |

## Why

A component name in public is a promise that the component has an identity worth
tracking across generations. Every one of those names is a thing we would then
have to keep, defend and explain. We have seven people.

The second reason is that our internal names are descriptive, and descriptive
names are hard to protect. Bellows describes a hinge that works like a bellows.
That is exactly why it is a good internal word and exactly why it is a weak
public one.

**What do we call these things in public then?**
The outer screen. The hinges, or three hinges. The software, or just the phone.
Plain words. A reviewer writing "the outer screen is a polymer" is a better
outcome than one writing "Meniscus is a polymer" and then having to explain what
Meniscus is.

**What if a component name leaks?**
It will, eventually, out of a supplier document or a teardown. We do not confirm
and we do not correct. An internal codename spotted in the wild is a curiosity.

**Does this apply to the panel state names?**
Yes. COVER, PHONE, BOOK, DESK, LAPTOP and TENT are internal. The user facing
words are whatever the shell puts on screen, and Ben and Priya work those
separately.

## Follow ups

- [x] Strip component names from the press deck
- [x] Strip them from the demo script
- [ ] Check the launch post draft for Ori, which was in draft one
- [ ] Ask Dana whether supplier documents carry the codenames
