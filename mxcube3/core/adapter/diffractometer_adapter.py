from mxcube3.core.adapter.adapter_base import AdapterBase


class DiffractometerAdapter(AdapterBase):
    ATTRIBUTES = ["head_configuration"]

    def __init__(self, ho, *args, **kwargs):
        """
        Args:
            (object): Hardware object.
        """
        super(DiffractometerAdapter, self).__init__(ho, *args, **kwargs)
        ho.connect("stateChanged", self._state_change)

    def _state_change(self, *args, **kwargs):
        self.state_change(**kwargs)

    def stop(self):
        pass

    def state(self):
        return "READY" if self._ho.is_ready() else "BUSY"

    def head_configuration(self) -> dict:
        data = self._ho.get_head_configuration()
        data = data.dict() if data else {}

        return data
