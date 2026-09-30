"""Auto mode: no goniometer moves from the web client while the queue runs.

The PX1 goniometer (Smargon) takes one command at a time, and while the
queue executes its procedures (centring, mesh, collection, sample transfer)
own it. A user move sent in the middle would either collide with them or,
queued behind them, run against a sample position that has changed since the
click. So they are refused, and the UI greys the controls out.
"""

import functools
import logging

from flask import Response
from mxcubecore import HardwareRepository as HWR

GONIO_LOCKED_MSG = "Goniometer moves are disabled while the queue runs"


class GonioLocked(RuntimeError):
    pass


def gonio_moves_allowed():
    try:
        return not HWR.beamline.queue_manager.is_executing()
    except Exception:
        logging.getLogger("MX3.HWR").exception("gonioguard: cannot read the queue state")
        return True


def is_gonio_motor(ho):
    """A Smargon axis (SmargonAxis). Zoom, focus and the rest stay free."""
    return getattr(ho, "smargon", None) is not None and bool(
        getattr(ho, "motor_name", None)
    )


def assert_gonio_moves_allowed(what):
    if not gonio_moves_allowed():
        logging.getLogger("user_level_log").warning("%s refused: %s", what, GONIO_LOCKED_MSG)
        raise GonioLocked(GONIO_LOCKED_MSG)


def gonio_move(func):
    """Route decorator: refuse (409) a goniometer move while the queue runs."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            assert_gonio_moves_allowed(func.__name__)
        except GonioLocked:
            return Response(GONIO_LOCKED_MSG, status=409)
        return func(*args, **kwargs)

    return wrapper
