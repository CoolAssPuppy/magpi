ACCREDITED TEST HOUSE
Pre-booking readiness checklist, form TH-07 rev 9

Return this form no later than five working days before the booked chamber
date. An incomplete form moves the booking.

Client              Supaphone Ltd
Device              Fold S1, pre-production, B-series
Booking             Chamber 2, from 2026-09-14, five days held
Completed by        Ben Achilov
Date completed      2026-09-08

Uploaded to the Engineering space by Ben Achilov, 2026-09-08. This is their
form with our answers typed into it. The unanswered lines are unanswered on
purpose and are the list of what we still owe them.

SECTION 1  DEVICE IDENTIFICATION

  [x] Model designation as it will appear on the label      Fold S1
  [x] Hardware revision under test                          B-series, rev C
                                                            Bellows, Meniscus-C
                                                            outer layer
  [x] Firmware version under test                           0.7.8
  [x] Shell and window manager version                      ori-0.9.4
  [ ] FCC ID as applied for                                 application drafted,
                                                            not filed
  [x] Photographs of label placement, all fold states       supplied
  [x] Block diagram, current revision                       supplied

SECTION 2  MECHANICAL STATES

The client must define every mechanical configuration in which the device can
be operated, and supply a jig or written procedure for placing the device in
each one repeatably.

  State     Description                              Procedure supplied
  COVER     Shut, one panel active                   [x]
  PHONE     Outer hinge open, two panels             [x]
  BOOK      Outer and centre hinges open, three      [x]
  DESK      All three hinges open, four panels       [x]
  LAPTOP    Outer hinge at the 90 degree detent      [ ] not yet scanned
  TENT      Propped, inverted, two panels            [ ] not yet scanned

  Note from client: LAPTOP and TENT are mechanically identical to PHONE from
  the antenna's point of view, and we still expect to scan them because we have
  been wrong about that kind of assumption before. Both will be scanned
  internally before the 12th.

SECTION 3  RADIO CONFIGURATIONS

  [x] Band list and power classes                    supplied, all bands
  [x] Antenna placement drawings, per fold state     supplied
  [x] Tuning profile per fold state                  P0 to P3, table supplied
  [x] Test mode software, documented                 supplied with build 0.7.8
  [x] Method to lock the device in a fold state      documented, see section 2

  Known issues declared by the client:
    - BOOK, low band, margin approximately 1.5 dB. Client believes this is the
      ground plane split across the centre hinge. Mitigation in progress.
    - Radiated emissions at 875 MHz, horizontal, DESK only. Client fix applied
      2 September, internal re-scan passes with 4 dB or better.

SECTION 4  RF EXPOSURE

  [x] Exposure test plan revision                    revision 4
  [x] Positions to be tested                         head, body-worn at 0 mm
                                                     and 15 mm, all fold states
                                                     including half fold
  [x] Simulation results supplied in advance         yes
  [x] Worst case predicted by simulation             half fold, 15 mm, band
                                                     n77, 1.42 W/kg against a
                                                     1.6 limit
  [ ] Client acknowledges tight margin cases         signature required below

SECTION 5  SAMPLES

  [ ] Two units for radiated testing                 not yet shipped
  [ ] One spare unit                                 not yet shipped
  [x] Charger, cable and any accessory in the box    shipped 2026-09-07
  [ ] Signed declaration inside each sample box      pending
  [x] Units are cosmetically representative          yes, and they will come
                                                     back scratched, which the
                                                     client accepts

  Client note: the two units and the spare ship together. They cannot be built
  from pilot line material before the Shenzhen trip, so if the test house needs
  pilot material specifically, tell us this week and not on the 14th.

SECTION 6  SUPPORTING DOCUMENTS

  [ ] Battery safety report, IEC 62133               with the cell vendor's
                                                     laboratory, expected the
                                                     week of 14 September
  [ ] VoLTE and VoNR results                         not started
  [x] Device management client statement             supplied
  [x] Thermal test summary                           supplied, see client note
  [ ] Declaration of conformity                      unsigned

  Client note on thermal: our worst case is the four panel DESK state under
  sustained video, at 41.6 C skin against our own 43 C internal limit, measured
  at 25 C ambient. We would like the chamber ambient confirmed in writing,
  because our margin at 30 C ambient is 0.3 C and we would rather find that out
  here than in your chamber.

SECTION 7  SIGN OFF

  Client technical contact      Ben Achilov
  Client authorised signatory   pending, Jane Okonkwo to sign section 4
  Date                          2026-09-08

  Test house use only
  Received                      __________
  Booking confirmed             __________
  Form complete                 [ ] yes  [ ] no, items outstanding: 2.5, 2.6,
                                5.1, 5.2, 5.4, 6.1, 6.2, 6.5, 7.2
