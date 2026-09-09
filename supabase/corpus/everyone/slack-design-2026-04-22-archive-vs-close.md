# #design, 22 April 2026

Thread started by Ruth Adeyemi at 15:12.

**Ruth Adeyemi** (15:12)
Sat with Rosa on support calls this morning and I want to write down what I saw
while it is fresh.

Four calls. Three of them, at some point, the customer said a version of "I
closed it but it is still there" or "where did it go".

**Ruth Adeyemi** (15:14)
The conversation header has Archive and Close next to each other. Archive is an
icon. Close is a button with a word in it. They are eleven pixels apart.

Archive takes the thread out of the list. Close marks the shipment as finished
and leaves the thread in the list with a grey badge. Those are almost opposite
outcomes and we have given the more destructive looking one an icon and the
less destructive one a word.

**Ruth Adeyemi** (15:15)
Nobody I watched today could have told you which was which before clicking.

**Hal Winters** (15:31)
This is not new. I can find you tickets going back to last year. The one I
remember is a dispatcher who archived forty threads on a Friday because she
thought she was clearing finished jobs, and then spent Monday morning
un-archiving them one at a time because we do not have a bulk restore.

**Hal Winters** (15:32)
She was not confused about her own work. She was confused about our words.

**Ruth Adeyemi** (15:38)
Right. And I think the words are the problem rather than the layout. Close is a
verb that in every other product means make this go away. In Portside it means
the shipment is delivered and the paperwork is done.

**Sofia Berg** (15:44)
What would you call it

**Ruth Adeyemi** (15:47)
Something that describes the shipment rather than the thread. Delivered.
Completed. Resolved. Resolved is the one I keep coming back to even though it
sounds like a support ticket.

The point is that Close describes what happens to the window and Archive
describes what happens to the thread, and neither of them describes what
happened to the freight, which is the thing the user is actually thinking about.

**Rosa Delgado** (16:02)
adding one from this afternoon, customer asked "if I close it does the carrier
still see it"

**Rosa Delgado** (16:02)
which is a whole other thing but same root

**Sofia Berg** (16:19)
Agree there is something here. Not this quarter though. Renaming a verb in the
header means the help centre, the email notifications, the API field name and
probably a migration on the status enum. That is not a design change, it is a
month.

**Ruth Adeyemi** (16:24)
I am not asking for it this quarter. I am asking for it to be written down
somewhere that is not my notebook.

**Sofia Berg** (16:25)
Fair. Put it on the Q4 shortlist page and I will make sure it gets read.

**Ruth Adeyemi** (16:41)
Done. Two things on the shortlist: rename the verb, and separate the two
controls so a mis-click is harder. The second one is small and could go any
time.

**Hal Winters** (17:03)
If you only do the second one I will take it.
