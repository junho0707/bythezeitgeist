"""
Shared helpers for turning a "day" or "week" range request into the
concrete dates each source's API actually needs. Every source has a
different native notion of "weekly", so this module just standardizes
how we talk about ranges; each source file decides how to fulfill it.
"""

from __future__ import annotations
from datetime import date, timedelta
from dataclasses import dataclass


@dataclass(frozen=True)
class Range:
    kind: str          # "day" or "week"
    end: date          # the last day of the range (for a week, its Saturday)
    days: list[date]   # every calendar day covered, oldest -> newest

    @property
    def start(self) -> date:
        return self.days[0]


def build_range(kind: str, anchor: date | None = None, use_yesterday_for_day: bool = True) -> Range:
    """
    kind: "day" or "week"
    anchor: defaults to today (UTC-naive, uses local server date)
    use_yesterday_for_day: several of these APIs (Wikipedia pageviews in
        particular) don't have finished data for "today" yet since the
        day isn't over. Defaulting a single "day" request to yesterday
        avoids partial/empty results. Set False if you specifically want
        today's partial data anyway.
    """
    anchor = anchor or date.today()
    if kind == "day":
        d = anchor - timedelta(days=1) if use_yesterday_for_day else anchor
        return Range(kind="day", end=d, days=[d])
    elif kind == "week":
        # The calendar week (Sunday through Saturday) holding yesterday, the
        # last finished day. On Sunday that is the week just ended, so the
        # page never opens on an empty week. Days not finished yet simply
        # have no data.
        last_done = anchor - timedelta(days=1)
        start = last_done - timedelta(days=(last_done.weekday() + 1) % 7)
        days = [start + timedelta(days=i) for i in range(7)]
        return Range(kind="week", end=days[-1], days=days)
    else:
        raise ValueError(f"kind must be 'day' or 'week', got {kind!r}")
