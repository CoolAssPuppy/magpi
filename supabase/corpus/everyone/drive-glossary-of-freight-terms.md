# Freight and EDI glossary

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

Written for people who have just joined and are reading customer
tickets for the first time. Two columns in the original. If a line
looks like it has two things in it, it does.

--- Page 1 ---

Accessorial Any charge on top of the line haul rate. Detention,
layover, lumper fees and reweighs are all accessorials. Customers
argue about these more than they argue about the base rate.

Appointment A booked time slot at a shipper or receiver. Miss it and
you may wait hours for the next one.

Backhaul The return leg of a trip. A carrier will often take a
backhaul cheap because the alternative is running empty.

Bill of lading The document that says what is on the truck, who
shipped it and who is receiving it. Often written BOL or B/L. It is the
contract of carriage and the receipt, and if there is a dispute about
what was loaded, this is the paper everyone reaches for. In Portside it
usually arrives as a PDF attachment on the thread.

Broker A company that arranges freight between a shipper and a
carrier without owning trucks. Most Portside customers are
brokers.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

--- Page 2 ---

Carrier The company that actually moves the freight. Owns or
contracts the trucks and the drivers.

Consignee The party receiving the freight. The delivery end.

Consignor The party sending it. Same as shipper in most usage,
though the paperwork sometimes distinguishes them.

Deadhead Driving with an empty trailer. Usually to reposition for
the next load. Carriers try to be paid for it and often are not.

Demurrage Charges for holding equipment, usually containers, beyond
the free time allowed at a port or rail terminal. Related to
detention but not the same thing, and the two get mixed up
constantly in tickets.

Detention Time a driver waits at a shipper or receiver beyond an
agreed free period, and the charge that follows from it. Usually
billed hourly after the first two hours. The clock runs from arrival,
which is why the arrival status message matters so much.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

--- Page 3 ---

Dispatch The act of assigning a load to a carrier and driver, and
the person or team who do it. Portside's main users are
dispatchers.

Drayage A short haul move, typically between a port or rail yard and
a nearby warehouse. Short distance, high coordination, lots of
appointments and detention.

Dwell Time a shipment sits somewhere without moving.

EDI Electronic Data Interchange. The message formats trading
partners use to exchange shipment information without email.
Each message type has a number.

EDI 204 The load tender. A shipper sends a 204 to offer a load to a
carrier or broker, with the stops, the commodity, the weight and the
requested times. Portside turns an incoming 204 into a thread.

EDI 210 The freight invoice. The carrier's bill.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

--- Page 4 ---

EDI 214 The shipment status message. This is the one that arrives
most often and matters most day to day. It carries a status code and a
timestamp: picked up, in transit, arrived at delivery, delivered,
and a long tail of exception codes for things like a missed
appointment or a refused delivery. Portside posts each 214 into the
thread as it lands, which is how a dispatcher sees a load move without
phoning anybody. There are two implementation guides in common use
among our customers and the segment order differs between them.

EDI 990 The response to a load tender. Accept or decline.

EDI 997 The functional acknowledgement. Confirms a message was
received and was structurally valid. Says nothing about whether the
content made sense.

FTL Full truckload. One shipper's freight fills the trailer.

LTL Less than truckload. Several shippers share a trailer, so a
shipment goes through terminals and takes longer.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

--- Page 5 ---

Layover An overnight wait. Charged when a driver is held long enough
that the trip runs into another day.

Load reference A number the customer uses for their own shipment.
Everybody has one and no two are the same shape. Ours is not theirs.
This is the single most common thing a dispatcher types into search.

Lumper fee A charge for someone at the receiving warehouse
unloading the trailer. The driver often pays it and gets reimbursed,
which means a receipt has to end up on the thread.

MCnumber A carrier's operating authority number. Used to identify
who you are dealing with.

POD Proof of delivery. The signed document, or increasingly a photo,
showing the freight arrived and who took it. Getting the POD is
frequently the last thing standing between a broker and an
invoice.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

--- Page 6 ---

Rate confirmation The document that records the agreed price for a
specific load between the broker and the carrier. Signed by both.
Written rate con in every ticket you will ever read. Losing the rate
con is the problem Portside exists to solve, and it comes up in sales
calls in roughly those words.

Reefer A refrigerated trailer. Temperature is part of the load
requirements and part of the argument when something goes wrong.

SCAC A short alphabetic code identifying a carrier. Turns up in EDI
messages and in nothing else a dispatcher looks at.

Shipper The party whose freight is being moved. The customer of the
broker.

Tender The offer of a load to a carrier or broker. Sent as an EDI
204 or as an email or, still, as a phone call. Accepting a tender is
what turns an offer into a shipment.

Trailer pool Trailers a carrier leaves at a shipper's site so
loading can happen before a truck arrives.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026

--- Page 7 ---

Notes on usage inside Portside

- We say thread, customers say load or shipment or file. All four mean
the same object.
- We say status, EDI says status code. When a ticket says "the status
did not come through" it is almost always a 214.
- We say attachment, customers say paperwork.

If a term is missing, add it. This page is not owned by anyone in
particular.

Alderwick Systems Ltd.
Freight and EDI glossary, 11 February 2026
