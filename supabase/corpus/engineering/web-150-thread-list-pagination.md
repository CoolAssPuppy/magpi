# WEB-150 Thread list loses scroll position on page two

Team: Web
Status: Done
Priority: Medium
Assignee: Ruth Adeyemi
Labels: web, bug
Created: 2026-06-02
Completed: 2026-06-10
Estimate: 2
Cycle: Cycle 32

## Description

Scroll to the bottom of the thread list, hit Load more, and the list jumps back
to the top with the next fifty threads appended below the fifty you were already
looking at. So you scroll down again past the ones you have read to get to the
new ones. Do it three times and you are scrolling past 150 threads to reach 151.

Reported by Rosa Delgado on behalf of two accounts, and by Hal, and by me,
independently, in the same week.

## Steps to reproduce

1. Open the thread list on any account with more than fifty threads.
2. Scroll to the bottom.
3. Click Load more.
4. The scroll container is at offset 0.

Happens in every browser. Happens with filters applied and without.

## Cause

`ThreadList.tsx` renders the virtualised list inside a container that is keyed on
the page count:

```tsx
<div key={`threads-${pages.length}`} ref={scrollRef} className="thread-scroll">
```

When the second page resolves, `pages.length` changes from 1 to 2, React sees a
new key, unmounts the container and mounts a fresh one. The new node has a scroll
offset of 0 because it is a new node. The virtualiser then measures against it
and everything below is correct, which is why this reads as a scroll bug rather
than a rendering bug.

The key was added in March in the commit that introduced the virtualiser, to
force a remeasure when the row count changed. The virtualiser handles a changing
row count on its own and has since the version we upgraded to in April. So the
key was a workaround for something that was fixed four weeks later and nobody
went back for it.

## Fix

Remove the key. Give the container a stable identity and let the virtualiser
observe `pages` for the count.

Two things that came out of doing it. The row height estimate was also being
recalculated on every mount and is now measured once, which took a visible flash
out of the load. And the focus ring was being lost on remount, so a keyboard user
who tabbed to Load more and pressed it lost their place entirely rather than
partly. That is fixed by the same change and I would not have found it if I had
not been in there.

## Comments

**Ruth Adeyemi, 2 June**

Taking it. It is a one line fix and I want to say out loud that it has been in
production since March and three of us reported it in the same week, which
suggests it was there for two months and everybody assumed somebody else had
filed it.

**Hal Winters, 3 June**

Four tickets in my queue mention it without describing it as a bug. They say
things like "the list keeps going back to the start". I had them filed under
search complaints.

**Ruth Adeyemi, 9 June**

In review. Also fixed the focus ring and the row height flash, both in the same
change, both caused by the remount. Diff is smaller than the description.

**Sofia Berg, 10 June**

Shipped. Hal, move those four tickets out of the search pile, they are inflating
a number I am using in an argument.

**Hal Winters, 10 June**

Moved. It was four out of 120, so the argument survives.
