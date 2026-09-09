# #product, 1 September 2026

Thread started by Sofia Berg at 08:30.

**Sofia Berg** (08:30)
Q4 shortlist is open for comment for two weeks. Nothing is committed. The list is
longer than the quarter on purpose, so the leads meeting has to cut rather than
choose.

1. `SRCH-88`, replace the search index
2. Separate Archive and Close in the conversation header, and possibly rename the
   Close verb
3. Annual prepay discount
4. Attachment previews, `WEB-161`

**Sofia Berg** (08:31)
What is already spoken for: Kenji has the audit log writer into October and
Frankfurt after it. That is all of infrastructure. Q4 has less room than the
calendar suggests.

**Nadia Osei** (08:52)
I will say the SRCH-88 case once and then stop, because I have said it since
April and repetition is not evidence.

Filters shipped on 28 August and they work. Ticket volume on finding threads is
down. What that number hides is that filters help people who are narrowing a
list, and everyone else is still typing into a box that cannot find a load
reference under four characters. That group grows, because it is made of accounts
with two years of history and every month there are more of those.

**Nadia Osei** (08:54)
Filters bought us two quarters. I said that in June. This is the second of them.

**Sofia Berg** (09:10)
Recorded, and I am not arguing against it this time. My question is scope. Is it
one quarter, or one quarter and a tail of whatever we find in the EDI ingestion
path.

**Nadia Osei** (09:14)
There is a tail. I would rather write that down than pretend there is not.

**Ruth Adeyemi** (09:41)
Number two needs splitting. It has been one item since April and being one item
is why it never moves.

Separating the controls is small. Archive comes out of the header into the
overflow menu, with a confirm when more than five threads are selected. A week
including mobile. It fixes the mis-click, which is what costs people a Monday
morning.

**Ruth Adeyemi** (09:43)
Renaming Close is the month. Help centre, notification emails, the API status
field, a migration on the enum, and every customer with an integration written
against the current value.

**Ruth Adeyemi** (09:44)
So put the separation on the shortlist as its own line and let the rename be
judged on its own. I would rather have the week than lose both.

**Hal Winters** (09:58)
Seconding. I said in April I would take that one on its own and I still would.

**Ruth Adeyemi** (10:02)
Also worth saying, I am off from November. If the rename is a Q4 commitment it
needs somebody who is not me.

**Sofia Berg** (10:15)
Splitting it. Good.

**Priya Raman** (11:30)
Annual prepay. Whose is this and what does it mean in the billing service.

**Sofia Berg** (11:38)
Diane's, out of the pricing work. Customer pays twelve months up front and gets a
discount for it.

**Priya Raman** (11:44)
Then it is not a small item. The six annual commitment accounts I have been
handling by hand all through the migration stop being six exceptions and start
being a product.

**Priya Raman** (11:46)
Stripe does the invoice fine. It does not do the trueup, because overage against
a prepaid year is a question about what the allowance is. Is it 14,400 shipments
across the year or 1,200 a month with no carry. Nobody has answered that and it
is a commercial question.

**Sofia Berg** (11:52)
Tagging that for Diane and Elena. Priya, put the question in the shortlist page
exactly as you wrote it.

**Marcus Ilic** (14:20)
Four things on a shortlist and three of them are a quarter each. Say now which
one is the quarter.

**Sofia Berg** (14:26)
That is what the two weeks are for.

**Marcus Ilic** (14:27)
It is what the last three sets of two weeks were for as well.

**Hal Winters** (16:10)
attachment previews has been on a list for two years, can we just delete it or
does it have to keep going round

**Sofia Berg** (16:22)
It stays on until somebody says out loud that we are never doing it. Nobody ever
does.
