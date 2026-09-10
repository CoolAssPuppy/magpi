# ENG-230 · SoC throttles after 4 minutes of four-pane video

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | thermal, ori, firmware, bug |
| Project | Thermal budget |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-17 |
| Updated | 2026-09-06 |

## Description

Fully open, four panes lit, 1080p video on pane 2 and a browser on the other three. Package temperature hits 47C at four minutes and the governor drops the big cores. Frame rate on the video goes to 41fps and stays there.

Skin temperature on the back of pane 3 reads 43.1C, which is over the 43C limit we agreed for a surface a person holds.

Repro is in the firmware repo under `bench/thermal/four-pane-video.sh`.

## Activity

**Ben Achilov** changed status from Todo to In Progress · 2026-08-18

**Ben Achilov** commented · 2026-08-19
> The heat is not where I expected. The SoC is on pane 1 and the hot spot on the skin is on pane 3. That is the display driver for panes 3 and 4 running at full backlight, not the SoC.

**Sam Lindqvist** commented · 2026-08-20
> Then the fix is not a bigger vapor chamber, it is not driving four panes at 400 nits when three of them are showing a static page. What does Ori know about what is on each pane?

**Ben Achilov** commented · 2026-08-20
> Ori knows which pane has focus and which panes have had no content change for N seconds. It does not currently tell the display driver anything. It could.

**Ben Achilov** commented · 2026-08-25
> Prototype: per-pane backlight, panes with no content change for 8 seconds drop to 60% until something moves. Package temp at ten minutes is 44C, no throttle, skin on pane 3 is 40.4C.
>
> It looks bad in one case. If you are reading a long document on pane 4 and not scrolling, pane 4 dims. A person will notice.

**Jane Okonkwo** commented · 2026-08-26
> Dimming a page someone is reading is worse than a warm phone. Find the version that keeps a pane bright while a face is pointed at it, or make the timeout much longer.

**Ben Achilov** commented · 2026-08-27
> No face tracking on this hardware, that was cut in June. Trying 45 seconds and a slower ramp, 400 to 320 nits over three seconds instead of a step.

**Ben Achilov** commented · 2026-09-06
> 45 seconds and the slow ramp: package 45C at ten minutes, no throttle, skin 41.6C. Under both limits. Nobody in the office noticed the ramp when I did not tell them it was there, and three of four noticed it when I did.
>
> Keeping it. Still need the vapor chamber answer from ENG-233 for the sustained case.
