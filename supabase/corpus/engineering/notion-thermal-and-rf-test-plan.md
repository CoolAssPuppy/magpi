# Thermal and RF test plan

| | |
| --- | --- |
| Owner | Ben Achilov |
| Status | In progress |
| Test house | External lab, booked from 2026-09-14 |
| Last edited | 2026-09-04 |
| Tags | firmware, hardware, test, certification, plan |

## Why this is hard on a four panel device

The antennas live in panels 1 and 4, which are the two panels that move furthest
apart. Every fold state changes the antenna geometry, so a device that passes in
DESK can fail in COVER. We have to characterise each state separately and then
prove the firmware picks the right antenna tuning for the state it is in.

Thermal has the mirrored problem. Shut, the device is a four layer stack with no
airflow between the panels. Open flat, it is one thin surface with four times
the area. The same workload produces very different skin temperatures.

## RF matrix

| Fold state | Bands | Tuning profile | Status |
| --- | --- | --- | --- |
| COVER | All | P0 | Pre-scan done, passing |
| PHONE | All | P1 | Pre-scan done, passing |
| BOOK | All | P2 | Pre-scan done, one marginal band |
| DESK | All | P3 | Pre-scan done, passing |
| LAPTOP | All | P1 | Not scanned |
| TENT | All | P1 | Not scanned |

The marginal band in BOOK is at the low end and the margin is about 1.5 dB. Ben
thinks it is the ground plane split across H2. Sam is looking at a shield change
that does not move the tooling.

## Thermal matrix

| Case | Workload | Ambient | Skin limit | Result |
| --- | --- | --- | --- | --- |
| Shut, charging | 30 W charge | 25 C | 43 C | 41.2 C, pass |
| Shut, video call | Camera plus radio | 25 C | 43 C | 42.8 C, marginal |
| Flat, three app | Full Ori DESK layout | 25 C | 43 C | 38.9 C, pass |
| Flat, charging | 30 W charge | 25 C | 43 C | 36.4 C, pass |
| Shut, charging | 30 W charge | 35 C | 43 C | 44.1 C, fail |

> The shut and charging at 35 C ambient case fails today. The firmware fix is to
> taper charge power when the device is shut and the skin sensor passes 40 C.
> Ben has this in 0.7.8. It costs charge speed in a pocket and we accept that.

**Does the Meniscus material change affect thermal?**
Slightly. Polymer conducts less heat than glass, so the outer panel runs a
little cooler on the surface and the stack underneath runs a little warmer. The
measured difference on B11 was 0.6 C at the skin. It does not change any of the
verdicts above.

**Does it affect RF?**
No. The outer panel is not in the RF path. Confirmed in the outer layer decision
record.

## Before the lab date

- [x] Book the chamber
- [x] Pre-scan all six fold states in the internal chamber
- [ ] Scan LAPTOP and TENT
- [ ] Ship two golden units, one spare
- [ ] Firmware 0.7.8 with the charge taper on every unit that ships
- [x] Confirm the tuning profile table matches the shipped firmware
