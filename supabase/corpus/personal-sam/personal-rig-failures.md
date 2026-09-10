running list of every time a rig has cost me data. started june, last entry
8 sept 2026, keep adding

the point of this list: three of these were preventable and I want to be able
to prove that when I ask for the second fixture

june
- bench 1, drive belt slipped on the a-series run, ~2k cycles counted that did
  not happen. found it because the torque trace went flat. recounted from the
  photo grid. cost: half a day
- chamber, humidity sensor drifted 8 points over two weeks. every RH number
  from that fortnight is soft. cost: a fortnight of environmental data I do not
  quote any more

july
- bench 2, load cell zero drift. showed up as torque falling 3 percent over a
  weekend on a unit that was not being cycled. calibrated. now calibrated
  weekly. cost: two days and one embarrassing message to ben about a hinge
  problem that did not exist
- bench 1, unit fixture cracked at the panel 4 clamp. it is a printed part and
  printed parts are fine until they are not. printed a new one thicker. cost:
  a day

august
- 17 aug. chamber door interlock tripped at 02:14, rig stopped overnight, all
  four units parked at about 71k. someone left the second latch open on friday.
  units were parked OPEN which is the good failure, a unit parked shut for five
  hours takes a set. cost: four hours of soak and my photo counter offset from
  the 5k grid by 400 cycles. tape and an unkind note now on the latch
- ~~24 aug bench 2 sounded wrong~~ it was the extractor fan, not the rig
- 29 aug. bench 2 shared bench power. somebody plugged a heat gun into the same
  strip and browned out the controller mid-cycle. no data lost because the
  controller parks on brownout, which is the one good thing I can say about it.
  bench 2 now has its own supply. cost: an hour, and it could have cost the
  whole b11 run

september
- 3 sept. drop fixture release solenoid double-fired on drop 11 of b18. unit
  hit twice, second impact from about 15cm. logged the drop as void and reran
  on a different corner. if I had not been watching I would have recorded a
  1.2m result that was really 1.2m plus a bounce
- 5 sept. bench 3 counter reset to zero on a power cycle. b12 was at 61k. the
  counter is in volatile memory, which I did not know, because I did not write
  the firmware for a bench I bought. recovered the count from the photo grid,
  61,400. now writes to file every 1,000 cycles. cost: an afternoon and a small
  amount of dignity
- 8 sept. nothing broke today. writing this down because the list only ever
  gets the bad days and it reads worse than the lab is

patterns, since nobody else is going to do this analysis

- 5 of 9 are instrumentation. the rigs themselves run. what fails is the
  measuring
- 3 of 9 are shared resources. shared power, shared chamber, shared bench
  space. every one of those is a second fixture that we do not have
- 1 is a printed part, which is the cost of printing parts and I accept it
- every single one was found by me being in the room. none of them raised an
  alarm. the benches have no alarms because the benches came from three
  different suppliers over four years and only one of them speaks to anything

what I would buy if anybody asked me what to buy
a second full assembly fixture, and one afternoon of somebody's time to make
all three benches log to the same file. that is it. that is the whole list

nobody asks me what to buy. I am told what we can afford, which is a different
question and always answered by someone who has not read this file
