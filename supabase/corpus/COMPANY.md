# Alderwick

Everything in `supabase/corpus/` is fiction. Alderwick does not exist, Portside
does not exist, and none of the people named here are real. The documents were
written for Recall so the demo has something with structure in it. This file is
the reference the rest of the corpus is consistent with. Read it before adding
a document.

## What the company does

Alderwick sells one product, Portside. Portside is a shared inbox and job
tracker for freight brokers and small logistics firms. Every shipment gets a
thread. Email from the carrier, status messages from the shipper's EDI feed,
the rate confirmation, the bill of lading, the photos the driver sent at the
dock: all of it lands in the same thread instead of in one person's Outlook and
a spreadsheet nobody else can open.

The customers are brokerages with between four and sixty people. They are not
buying a platform. They are buying a way to stop losing the email where the
carrier agreed to a price.

Portside charges $340 per month for the Standard plan, which includes five
seats and 1,200 shipments a month, plus $0.11 per shipment above that. There is
a Growth plan at $890 with twenty seats. Most revenue comes from Standard
accounts that go over on shipments every month.

Alderwick has 31 people. Nineteen are in engineering, product and design. The
rest are sales, support and two people who do finance and everything else.
There is an office in Manchester and about a third of the company is remote.
The company is eight years old and has never raised more than a seed round,
which is a fact leadership repeats often enough that it has become a personality
trait.

## Who works there

| Name           | Role                                | What they are usually arguing for                                       |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Diane Ockley   | Chief executive                     | Getting the pricing change out before the October renewals.             |
| Marcus Ilic    | Head of engineering                 | Fewer things in flight. He has said this in three consecutive quarters. |
| Sofia Berg     | Product manager, core product       | Filters and saved views before any rewrite.                             |
| Priya Raman    | Engineering lead, platform          | Owning less code. She inherited the billing service and did not want it.|
| Nadia Osei     | Staff engineer, search              | Replacing the search index rather than patching the ranking again.      |
| Jonah Kestrel  | Engineer, billing                   | Whatever gets the trueup job off his plate. He is moving to search.     |
| Kenji Mori     | Infrastructure engineer             | The EU region, and being honest with customers about when it lands.     |
| Ruth Adeyemi   | Designer                            | The conversation header, which she thinks has too many verbs in it.     |
| Elena Vargas   | Head of sales                       | Knowing the new prices before the customers do.                         |
| Hal Winters    | Support lead                        | Search, because half his tickets are people who cannot find a thread.   |

Two more names appear in passing and have no documents of their own: Ade
Fashola in finance, and Rosa Delgado on support.

## The tools they use

- Notion for planning documents, specifications, decision records and meeting
  notes. The longest documents.
- Linear for issues. Prefixes are `BIL` for billing, `SRCH` for search, `INF`
  for infrastructure, `WEB` for the web client, `MOB` for mobile, and `EDI` for
  the EDI parsers.
- Slack for the arguments. Channels are `#general`, `#product`, `#eng`,
  `#billing`, `#design`, `#support`, `#sales` and `#leads`.
- Google Drive for slide exports, PDFs and the occasional transcript. These are
  the documents that survived a conversion and read like it.

## What they are arguing about this quarter

**Billing.** In March they decided to build invoicing, proration and the
month-end trueup themselves on top of Stripe payment primitives, rather than
use Stripe Billing. In May the proration bugs made that decision look worse
than it did in March. In June they reversed it. The cleanup runs through Q3 and
is the largest single piece of engineering work in the quarter. In Linear it is
the `BIL` project. In Slack it is the Stripe thing. In the planning documents it
is the billing migration.

**Search.** Customers cannot find old threads. Nadia wants to replace the index.
Sofia wants filters and saved views first, on the grounds that most of the
tickets Hal sees are people who know exactly which thread they want and cannot
narrow the list. Neither has convinced the other. In Linear it is `SRCH`. In
Slack it is the search rewrite, or occasionally the fuzzy search thing.

**The EU region.** Two customers have asked for data to stay in Europe.
Alderwick planned a Frankfurt deployment for Q3. It has slipped to Q4 because
the audit log writer assumes one primary database and has to be rewritten
first. In Linear it is `INF-311`. In Slack it is Frankfurt.

**Pricing.** Leadership is changing the Standard price and the overage rate in
October. Nobody outside leadership has the numbers yet, and sales keeps asking.
This is the only genuinely confidential thing in the company right now, which
is why it is the thing everyone talks about.

**Mobile.** The mobile app shipped in July without offline drafts. Sofia cut
them. Support has opinions.

**The old EDI parser.** There is a 214 status parser written in 2021 that
handles seven customers and times out on two of them. Retiring it means asking
those seven to change something, which nobody wants to do in the same quarter
as a price rise.

## House style, for anyone adding a document

These are documents written by people under time pressure. They are allowed to
be uneven. A Slack thread can trail off without a conclusion. A Linear comment
can be one line. A meeting note can have a bullet that somebody started and did
not finish. That is what makes the corpus useful.

No emoji and no em dashes, anywhere, including inside a fictional person's
Slack message. Sentence case in headers. No statistic about the real world that
a viewer could mistake for a fact. Alderwick's own numbers are fine and
necessary: seat counts, ticket numbers, its own prices, how many customers use
the old parser. A claim about the freight industry or about a real vendor's
capabilities is not.
