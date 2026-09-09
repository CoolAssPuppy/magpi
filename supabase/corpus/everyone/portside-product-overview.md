# Portside: what it is and who buys it

Owner: Sofia Berg
Last edited: 3 February 2026
Audience: new joiners, any function

I wrote this because I kept giving the same forty minute explanation to every
new starter and forgetting a different part of it each time. If you have been
here a year this page is not for you, although you should tell me if I have got
something wrong.

## What we sell

Portside is a shared inbox and job tracker for freight brokers. One shipment gets
one thread. Everything about that shipment goes in the thread: the email from the
carrier, the rate confirmation, the bill of lading, the status messages from the
shipper's EDI feed, the photo the driver took at the dock at half six in the
morning.

The alternative most of our customers arrive from is one person's Outlook plus a
spreadsheet on a shared drive. That works until the person is on holiday, or
leaves, or the spreadsheet gets two versions.

## Who buys it

Brokerages with between four and sixty people. We have 214 live accounts.

The buyer is usually the owner or the operations manager, and the trigger is
almost never a strategic review. It is an incident. A load went wrong, the
customer asked what happened, and nobody could find the email where the carrier
agreed to the price. That email existed. It was in somebody's inbox.

They are not buying a platform and they will tell you so on the call. Elena's
team has learned to demo the search box and the thread view and nothing else.

## What a broker's day looks like

A broker matches freight that needs moving with a truck that can move it. On a
normal day a dispatcher at a sixteen person brokerage is running somewhere
between twenty and forty active loads.

For each one there is a sequence that barely changes. A shipper asks for a quote.
The broker emails three or four carriers. One agrees a price. The broker sends a
rate confirmation, the carrier signs it, the truck collects, and then for one to
four days the broker's job is answering "where is it" without phoning the driver
every hour. At delivery there is a signed bill of lading, then an invoice, then a
dispute about a detention charge roughly one time in fifteen.

The whole job is chasing a document or a status that exists somewhere and is not
where you are looking. That is the thing we sell against.

## What a shipment thread contains

| Item | Where it comes from | Who adds it |
| ---- | ------------------- | ----------- |
| Load record | Created by the broker, or imported | Portside |
| Email messages | Carrier and shipper email, both directions | Portside inbound address |
| Rate confirmation | Uploaded, or generated and sent | Broker |
| Bill of lading | Uploaded, usually a photo | Driver or broker |
| Status events | The shipper's or carrier's EDI 214 feed | Parsed automatically |
| Dock photos | Emailed or texted in by the driver | Driver |
| Internal notes | Typed by staff, not visible outside | Broker staff |
| Audit entries | Every write, who and when | Portside |

Every message in the thread is addressable by email. A carrier replies to a
normal looking email address and the reply arrives in the thread rather than in
one person's mailbox. Most customers never explain this to their carriers and
their carriers never notice.

## Plans and prices

| Plan | Price per month | Seats included | Shipments included | Extra seat |
| ---- | --------------- | -------------- | ------------------ | ---------- |
| Standard | $340 | 5 | 1,200 | $28 |
| Growth | $890 | 20 | 4,000 | $28 |

Shipments above the included volume are $0.11 each.

Most of our revenue is Standard accounts that go over on shipments every month,
which is worth understanding before you assume the plan fee is where the money
is. Eleven accounts have a negotiated allowance that is not the plan default. Six
have an annual commitment paid monthly. Those two facts are responsible for most
of the complexity in our billing code and most of the conversations Ade has on
the first of the month.

If a customer asks about pricing changes, send them to Elena. There is a page in
the Everyone space about what to say.

## EDI 214 status messages, and why they matter

EDI is the format shippers and carriers have used to send each other structured
messages since long before any of us worked here. A 214 is the transportation
carrier shipment status message. It says: this shipment reached this status, at
this time, at this place.

A single 214 is a handful of coded segments. Departed pickup location. Arrived at
delivery location. Delivered. Estimated delivery time revised. Each carries a
timestamp, a location, and a reference number that ties it back to the load.

Portside receives these on a feed, parses them, and posts each status into the
thread as an event on the timeline. That is the whole feature and it is the one
customers notice on day three. Without it, "where is my load" is a phone call to
a driver. With it, the dispatcher looks at a thread.

Two things to know. First, the segments in a 214 are ordered, and different
trading partners have followed different implementation guides over the years, so
in practice a parser has to be tolerant of things a specification says are
invalid. Second, we run two parsers. The current one was written in 2024 and
handles everybody. There is a 2021 parser still running for seven customers whose
feeds the current parser rejects. Retiring it is on the list and is not a
technical problem, it is a customer notice problem.

## Three things Portside deliberately does not do

**We do not quote or rate.** Portside will not tell a broker what to charge or
what a lane is worth. Rating is a product with its own data requirements and its
own competitors, and every time we have looked at it the answer has been that our
customers already have a way to price and do not want ours.

**We do not move money.** No carrier settlement, no factoring, no invoicing the
shipper. Portside holds the documents that a payment argument is settled with,
and stops there. Customers ask for this roughly once a quarter and the answer has
been no since before I joined.

**We do not dispatch or optimise.** No load board integration, no suggesting
which carrier to call, no route planning. A sixteen person brokerage does not want
software choosing its carriers.

Saying no to those three is why a small team can keep one product good. It is
also why we lose about one deal a quarter to a full transport management system,
and that is a trade we have made on purpose.

## Words you will hear

- **Load.** One shipment. One thread.
- **Rate con.** Rate confirmation. The document where a price is agreed.
- **BOL.** Bill of lading. Signed at delivery. The document arguments are about.
- **Detention.** A charge for a truck waiting too long. The most common dispute.
- **Trueup.** Our month end job that counts shipments and adds the overage.
- **The thread.** What everyone here calls the product, including customers.
