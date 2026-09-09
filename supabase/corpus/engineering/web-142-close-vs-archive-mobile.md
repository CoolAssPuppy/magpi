# WEB-142 Archive and Close do the same thing in the narrow header

Team: Web
Status: Todo
Priority: Medium
Assignee: unassigned
Labels: web, bug, mobile-web
Created: 2026-05-06
Estimate: 2

## Description

Found this while testing the thread view on a phone sized viewport for the
mobile release.

Below 640px the conversation header collapses. The Archive icon and the Close
button both move into the overflow menu, and in the overflow menu they are
rendered by the same component with the same handler bound to
`onThreadDismiss`. The handler archives. So on a narrow viewport, tapping Close
archives the thread and the shipment never gets marked finished.

The thread disappears from the list, which looks like something worked, and the
shipment stays open in the reporting view. Two customers would see that as the
same outcome and it is not.

Reproduce:

1. Open any thread on a viewport under 640px wide.
2. Open the overflow menu in the header.
3. Tap Close.
4. Thread leaves the list. Check the shipment status: still open.

Introduced in the header refactor in February. Nobody caught it because the
desktop header renders the two controls from different components and only the
collapsed variant shares one.

## Fix

Bind Close to `onThreadResolve` in the collapsed variant. One line plus a test.

## Wider problem

While I was in there: even on desktop these two controls sit next to each
other, one is an icon and one is a button, and I had to read the source to work
out which one did what. I have been here two years.

If tapping the wrong one is easy and the outcomes are opposite, fixing the
binding fixes the bug and leaves the trap. Worth someone thinking about the
naming. Close is a very generic word for an operation that means the freight
got delivered.

Not my call and not in this issue's scope, but it should be somebody's.

## Comments

**Kenji Mori, 6 May**

Filing rather than fixing because I am on INF-311 this cycle. It is two points
and any web person can take it.

**Sofia Berg, 8 May**

Taking the binding fix into the mobile release scope. Leaving the naming
question out of it.

**Kenji Mori, 8 May**

Fine.

**Sofia Berg, 3 July**

Slipped out of the July release. It is real but the workaround is that the
thread can be un-archived, so it is not data loss, just a wrong looking state.
Moving to the second mobile release.
