from mxcube3.core.user.usermanager import BaseUserManager


class DummyUserManager(BaseUserManager):
    def __init__(self, app, server, config):
        super().__init__(app, server, config)

    def _login(self, login_id, password):
        # Assuming that ISPyB is used
        login_res = self.app.lims.lims_login(login_id, password, create_session=False)
        return login_res

    def _signout(self):
        pass
