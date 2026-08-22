"""The payloads every preview is recorded against.

One place, so the device recording and the web assertion are describing the
same screens. Chosen to cover what actually breaks a layout: a title that
wraps, a number that grew a digit, a list at its cap, and every state a page
can be in.
"""

FIXTURES = {
    "next_thing": {
        "typical": {
            "title": "Platform review with the storage team",
            "start": "09:54",
            "end": "10:30",
            "location": "MEET",
            "minutes_until": 12,
            "more": [{"title": "Design sync", "start": "11:00"}],
        },
        "imminent": {
            "title": "Standup",
            "start": "09:45",
            "end": "10:00",
            "location": None,
            "minutes_until": 0,
        },
        "long_title": {
            "title": "Quarterly planning with everyone who touches the ingest path",
            "start": "14:00",
            "end": "15:30",
            "location": "Room 4",
            "minutes_until": 240,
        },
        "all_day": {
            "title": "Out of office",
            "start": "00:00",
            "end": "23:59",
            "location": None,
            "minutes_until": 60,
            "all_day": True,
        },
        "empty": {},
    },
    "day_shape": {
        "typical": {
            "blocks": [0, 0, 1, 3, 3, 0, 1, 3, 0, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "current_hour": 12,
            "free_minutes": 200,
            "meeting_count": 4,
        },
        "one_meeting": {
            "blocks": [0] * 6 + [2] + [0] * 17,
            "current_hour": 9,
            "free_minutes": 660,
            "meeting_count": 1,
        },
        "empty": {
            "blocks": [0] * 24,
            "current_hour": 8,
            "free_minutes": 720,
            "meeting_count": 0,
        },
    },
    "deploys": {
        "typical": {
            "projects": [
                {
                    "name": "magpi-web",
                    "state": "ERROR",
                    "commit": "fix the preview font metrics",
                    "age_ms": 120000,
                },
                {"name": "magpi-docs", "state": "BUILDING", "age_ms": 40000},
                {"name": "notenerds", "state": "READY", "age_ms": 10800000},
                {"name": "strategic-nerds", "state": "READY", "age_ms": 172800000},
            ],
            "expanded": 0,
        },
        "all_ready": {
            "projects": [{"name": "magpi-web", "state": "READY", "age_ms": 3600000}],
            "expanded": 0,
        },
        "empty": {"projects": []},
    },
    "counters": {
        "typical": {
            "counters": [
                {"label": "Gmail", "value": 14, "delta": 3, "recent": "Re: storage quota bump"},
                {"label": "Linear", "value": 7, "delta": 0, "recent": "Fix the preview drift"},
                {"label": "Slack", "value": 2, "delta": 1, "recent": "standup in five"},
                {"label": "Reviews", "value": 5, "delta": -2, "recent": "Port the SDK"},
            ],
            "selected": 0,
        },
        "one_source": {
            "counters": [{"label": "Gmail", "value": 0, "delta": 0, "recent": None}],
            "selected": 0,
        },
        "empty": {"counters": []},
    },
    "one_number": {
        "typical": {
            "label": "Weekly active",
            "value": 8412,
            "unit": None,
            "spark": [
                60, 62, 61, 66, 64, 70, 68, 74, 71, 78,
                76, 82, 80, 87, 84, 90, 86, 92, 89, 94,
                91, 96, 93, 98, 95, 92, 97, 96, 94, 98,
            ],
            "delta_pct": 4.2,
            "source": "PostHog",
            "updated": "4m ago",
        },
        "big_value": {
            "label": "Events this month",
            "value": 123456789,
            "unit": None,
            "spark": [1, 2, 3],
            "delta_pct": -0.4,
            "source": "PostHog",
            "updated": "1h ago",
        },
        "empty": {"label": "Weekly active", "value": None},
    },
}

# Every page is recorded in these too, with no data, so the four states each
# page must answer for are all pinned.
STATES = ("ok", "empty", "not_connected", "error")
