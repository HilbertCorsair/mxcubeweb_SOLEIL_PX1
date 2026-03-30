import logging
import re
from enum import Enum

from mxcubeweb.core.adapter.adapter_base import ActuatorAdapterBase
from mxcubeweb.core.models.adaptermodels import (
    HOActuatorValueChangeModel,
    NStateModel,
    StrValueModel,
)


def _norm_label(s):
    """Compare user-facing labels case/spacing-insensitively (e.g. zoom2 vs Zoom 2)."""
    return re.sub(r"\s+", "", str(s).lower())


class NStateAdapter(ActuatorAdapterBase):
    def __init__(self, ho, *args):
        """
        Args:
            (object): Hardware object.
        """
        super().__init__(ho, *args)
        self._value_change_model = HOActuatorValueChangeModel

        ho.connect("valueChanged", self._value_change)
        ho.connect("stateChanged", self.state_change)

    @staticmethod
    def _enum_token(ev):
        """String sent to the web UI as `value` / listed in `commands`."""
        if isinstance(ev, Enum):
            if isinstance(ev.value, str):
                return ev.value
            return ev.name
        return str(ev)

    def _state_token_from_ho(self):
        gv = self._ho.get_value()
        return self._enum_token(gv)

    def _value_change(self, value):
        v = self._enum_token(value) if isinstance(value, Enum) else value
        self.value_change(v)

    def _get_valid_states(self):
        out = []
        for v in self._ho.VALUES:
            if v.name == "UNKNOWN":
                continue
            out.append(self._enum_token(v))
        return out

    def _get_available_states(self):
        state_names = self._get_valid_states()
        cur = self._state_token_from_ho()
        if cur in state_names:
            state_names.remove(cur)
        return state_names

    def commands(self):
        return self._get_valid_states()

    def _matches_token(self, ev, target: str):
        if self._enum_token(ev) == target or ev.name == target:
            return True
        return _norm_label(self._enum_token(ev)) == _norm_label(target)

    def _set_value(self, value: HOActuatorValueChangeModel):
        target = value.value
        for ev in self._ho.VALUES:
            if ev.name == "UNKNOWN":
                continue
            if self._matches_token(ev, target):
                self._ho.set_value(ev)
                return
        raise ValueError(
            "Unknown N-state value %r for %s" % (target, self._name)
        )

    def _get_value(self) -> StrValueModel:
        return StrValueModel(value=self._state_token_from_ho())

    def msg(self):
        try:
            return self._state_token_from_ho()
        except Exception:
            logging.getLogger("MX3.HWR").exception(
                "nstate adapter msg() failed for %s", self._name
            )
            return "---"

    def data(self) -> NStateModel:
        return NStateModel(**self._dict_repr())
