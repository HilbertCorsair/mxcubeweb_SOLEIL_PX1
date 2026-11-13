import contextlib
import datetime
import json
import logging
import uuid

import flask
import flask_security
import requests

from authlib.integrations.flask_client import OAuth
from flask_login import current_user
from mxcubecore import HardwareRepository as HWR
from mxcubeweb.core.components.component_base import ComponentBase
from mxcubeweb.core.models.usermodels import User
from mxcubeweb.core.util.networkutils import is_local_host

# Roles of the people connected to a session; at most one "user" at a time.
SESSION_ROLES = ("staff", "user", "guest")


class BaseUserManager(ComponentBase):
    """Base class for managing user-related operations

    Operation it manages are: authentication, session management, and Single Sign-On
    (SSO) integration. It provides methods to handle user login, logout, session
    updates, and role assignments. The class also includes functionality to manage
    active users, set operators, and validate SSO tokens. It is designed to be extended
    by more specific user manager implementations.

    Attributes:
        app: The application instance.
            It is used to access various components and configurations such as
            the Flask server instance and the configuration settings.
        config: The configuration settings for the user manager.
            It contains information such as SSO client ID, client secret and
            metadata URI.
    """

    def __init__(self, app, config):
        super().__init__(app, config)
        HWR.beamline.lims.connect("sessionsChanged", self.handle_sessions_changed)
        self.oauth_client = OAuth(app=app.server.flask)
        self.oauth_client.register(
            name="keycloak",
            client_id=self.app.CONFIG.sso.CLIENT_ID,
            client_secret=self.app.CONFIG.sso.CLIENT_SECRET,
            server_metadata_url=self.app.CONFIG.sso.META_DATA_URI,
            client_kwargs={
                "scope": "openid email profile",
                "code_challenge_method": "S256",  # enable PKCE
            },
        )
        # Single pending control handover: {"kind": "offer"|"request", "from", "to"}
        self.pending_handover = None
        self.signout_all_users()

    def handle_sessions_changed(self, sessions):
        self.app.server.emit("sessionsChanged", namespace="/hwr")

    def signout_all_users(self):
        """Sign out all users."""
        for user in User.query.all():
            self.app.server.emit(
                "forceSignout", room=user.socketio_session_id, namespace="/hwr"
            )
            self.app.server.user_datastore.delete_user(user)

        self.app.server.user_datastore.commit()
        logging.getLogger("MX3.HWR").info("Logged out all users on server startup")

    def set_role(self, user: User, role: str) -> None:
        """Replace the session role of ``user`` with ``role``."""
        user_datastore = self.app.server.user_datastore
        for _r in SESSION_ROLES:
            if _r != role and user.has_role(_r):
                user_datastore.remove_role_from_user(user, _r)
        user_datastore.append_roles(user, [role])

    def set_muted(self, user: User, muted: bool) -> None:
        user_datastore = self.app.server.user_datastore
        if muted:
            user_datastore.append_roles(user, ["muted"])
        elif user.has_role("muted"):
            user_datastore.remove_role_from_user(user, "muted")
            user_datastore.commit()

    def get_session_user(self) -> User | None:
        """Return the person holding the "user" role, if any."""
        return next((_u for _u in User.query.all() if _u.has_role("user")), None)

    def get_members(self) -> list[User]:
        """All authenticated and active users connected to the session."""
        return [_u for _u in User.query.all() if _u.is_authenticated and _u.active]

    def notify(self, msg: str, action: dict | None = None) -> None:
        """Log a session event and post it in the session chat."""
        logging.getLogger("MX3.HWR").info("[SESSION] %s", msg)
        self.app.chat.append_message(msg, action=action)

    def transfer_control(self, username: str | None, swap_roles: bool = False) -> None:
        """Give control to ``username``, or to nobody when ``username`` is None.

        With ``swap_roles`` the new operator becomes the session user and the
        previous session user becomes a guest.
        """
        oldop = self.get_operator()
        newop = self.get_user(username) if username else None

        if swap_roles and newop:
            olduser = self.get_session_user()
            if olduser and olduser.username != newop.username:
                self.set_role(olduser, "guest")
            self.set_role(newop, "user")

        if newop:
            self.set_operator(newop.username)
        elif oldop:
            self.db_set_in_control(oldop, False)

        self.pending_handover = None

        if oldop and (not newop or oldop.username != newop.username):
            self.app.server.emit(
                "userChanged", room=oldop.socketio_session_id, namespace="/hwr"
            )
        if newop:
            self.app.server.emit(
                "userChanged",
                "You were given control",
                room=newop.socketio_session_id,
                namespace="/hwr",
            )
        self.app.server.emit("observersChanged", namespace="/hwr")
        self.notify(
            "%s is now in control" % self.display_name(newop)
            if newop
            else "Nobody is in control"
        )

    @staticmethod
    def display_name(user: User) -> str:
        return "%s (%s)" % (user.nickname or user.username, user.username)

    def get_observers(self) -> list[User]:
        """List users that are in observer mode.

        Observer mode means user is logged in (authenticated and active) but not in
        control of the application.
        """
        return [
            user
            for user in User.query.all()
            if ((not user.in_control) and user.is_authenticated and user.is_active)
        ]

    def get_operator(self) -> User:
        """Return user object that is controlling the beamline (operator)."""
        user = None

        for _u in User.query.all():
            if _u.in_control:
                user = _u
                break

        return user

    def is_operator(self) -> bool:
        """Check if current user is an operator.

        Returns:
            ``True`` if the current_user is an operator.
        """
        return getattr(current_user, "in_control", False)

    def active_logged_in_users(self, exclude_inhouse: bool = False) -> list[User]:
        """List of active and logged in users.

        Args:
            exclude_inhouse (bool): exclude inhouse users from the list
        """
        self.update_active_users()

        if exclude_inhouse:
            users = [
                _u.username for _u in User.query.all() if _u.active and not _u.isstaff
            ]
        else:
            users = [_u.username for _u in User.query.all() if _u.active]

        return users


    def get_user(self, username: str) -> User | None:
        """Return user model instance based on username."""
        try: 
            user = User.query.filter_by(username=username).first()
            return user
        except Exception:
            return None


    def set_operator(self, username: str) -> User | None:
        """Set the user with the given username to be an operator."""
        user = None

        for _u in User.query.all():
            if _u.username == username:
                self.db_set_in_control(_u, True)
                user = _u
            else:
                self.db_set_in_control(_u, False)

        return user

    def update_active_users(self) -> None:
        """Check if any users have been inactive for longer than session lifetime.
        If so, deactivate the user in datastore and emit the relevant signals
        ``userChanged`` and ``observersChanged`` to the client.

        THis method is optimized to minimize database queries and handle
        connection pool exhaustion gracefully.
        """
        try:
            # Calculate the cutoff time for inactive users
            cutoff_time = datetime.datetime.now() - flask.current_app.permanent_session_lifetime
            
            # Use a single query to get inactive users and process them efficiently
            # This reduces the number of database round trips
            inactive_users = User.query.filter(
                User.active == True,
                User.last_request_timestamp.isnot(None),
                User.last_request_timestamp < cutoff_time
            ).all()
            
            # Batch process inactive users to reduce database commits
            if inactive_users:
                socketio_session_ids = []
                
                for _u in inactive_users:
                    logging.getLogger("MX3.HWR").info(
                        "Logged out inactive user %s", _u.username
                    )
                    # Store socketio session id before deleting user
                    if hasattr(_u, 'socketio_session_id') and _u.socketio_session_id:
                        socketio_session_ids.append(_u.socketio_session_id)
                    
                    # Delete user from datastore
                    self.app.server.user_datastore.delete_user(_u)
                
                # Single commit for all deletions (more efficient)
                try:
                    self.app.server.user_datastore.commit()
                except Exception as commit_error:
                    logging.getLogger("MX3.HWR").error(
                        "Error committing user deletions: %s", str(commit_error)
                    )
                    # Rollback on error
                    self.app.server.user_datastore.rollback()
                    return
                
                # Emit signals after successful commit
                for session_id in socketio_session_ids:
                    try:
                        self.app.server.emit(
                            "userChanged", room=session_id, namespace="/hwr"
                        )
                    except Exception as emit_error:
                        logging.getLogger("MX3.HWR").warning(
                            "Error emitting userChanged signal: %s", str(emit_error)
                        )
                
                # Emit observersChanged once after all users are processed
                try:
                    self.app.server.emit("observersChanged", namespace="/hwr")
                except Exception as emit_error:
                    logging.getLogger("MX3.HWR").warning(
                        "Error emitting observersChanged signal: %s", str(emit_error)
                    )
                
        except Exception as e:
            logging.getLogger("MX3.HWR").error(
                "Error updating active users: %s", str(e)
            )
            # Ensure we don't leave the session in a bad state
            try:
                self.app.server.user_datastore.rollback()
            except Exception:
                pass  # Ignore rollback errors
            
    def update_operator(self, new_login: bool = False) -> None:
        """Give control to the session user when nobody else holds it.

        Args:
            new_login: True if method was invoked with new user login.
        """
        if current_user.is_anonymous:
            return

        role = current_user.role

        if new_login:
            # Staff keep their login name, others are asked for a nickname
            current_user.nickname = current_user.username if role == "staff" else ""

        if role == "user" and self.get_operator() is None:
            current_user.fullname = HWR.beamline.lims.get_full_user_name()
            current_user.nickname = HWR.beamline.lims.get_user_name()
            self.db_set_in_control(current_user, True)
            try:
                self.app.lims.select_session(
                    HWR.beamline.lims.session_manager.active_session.session_id
                )
            except Exception as e:
                logging.getLogger("MX3.HWR").error("Error selecting session: %s", e)
        else:
            self.update_user(current_user)

    def is_inhouse_user(self, user_id: str) -> bool:
        """Check if the ``user_id`` is in the in-house user list.

        Args:
            user_id: user id composed from code and number.

        Returns:
            ``True`` if ``user_id`` is in the in-house user list, ``False`` otherwise.
        """
        # Use a cached list if available
        if not hasattr(self, '_inhouse_user_id_list') or self._inhouse_user_id_list is None:
            self._inhouse_user_id_list = [
                f"{code}{number}" 
                for (code, number) in HWR.beamline.session.in_house_users
            ]
        return user_id in self._inhouse_user_id_list


    # Abstract method to be implemented by concrete implementation
    def _login(self, login_id: str, password: str, role: str = "user") -> str:
        """Authenticate and return the effective session role."""
        return role

    def sso_validate(self) -> str:
        try:
            token_response = self.oauth_client.keycloak.authorize_access_token()
            username = token_response["userinfo"]["preferred_username"]
            token = token_response["access_token"]
        except Exception as e:
            print("UserManager.py in web > web > core > components > user  : ERROR in sso_validate")

            raise e
        else:
            self.login(username, token, sso_data=token_response)

    def sso_token_expired(self) -> bool:
        res = json.loads(
            requests.post(
                self.app.CONFIG.sso.TOKEN_INFO_URI,
                headers={"Authorization": "Bearer %s" % current_user.token},
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": current_user.refresh_token,
                },
            ).json()
        )

        return "access_token" not in res

    def handle_sso_logout(self):
        if current_user.is_anonymous and self.sso_token_expired():
            self.signout()

    def login(
        self, login_id: str, password: str, role: str = "user", sso_data: dict = {}
    ) -> None:
        """Login the user.

        Create new session for the user if it does not exist. Activate user in
        data store and try to update the operator.

        Args:
            login_id: The username.
            password: The password.
            role: Requested session role (staff, user or guest).
            sso_data: Dictionary containing information from the SSO service used.
        """
        requested_role = role
        try:
            role = self._login(login_id, password, role)
        except Exception as e:
            self._signout(sso_data=sso_data)
            logging.getLogger("MX3.HWR").error(str(e))
            raise e
        else:
            if "sid" not in flask.session:
                flask.session["sid"] = str(uuid.uuid4())

            # Making sure that the session of any in active users are invalidated
            # before calling login
            self.update_active_users()

            user = self.db_create_user(login_id, role, sso_data)
            self.app.server.user_datastore.activate_user(user)
            flask_security.login_user(user, remember=False)

            # Important to make flask_security user tracking work
            self.app.server.security.datastore.commit()
            self.update_operator(new_login=True)

            self.app.server.emit("observersChanged", namespace="/hwr")
            msg = "%s joined as %s" % (user.username, role)
            if role != requested_role:
                msg += " (a user is already running the session)"
            self.notify(msg)

    # Abstract method to be implemented by concrete implementation
    def _signout(self):
        pass

    def signout(self) -> None:
        """Sign out the current user.

        If the user was an operator, the queue and samples are restored to init values,
        the session is cleared, the user is not an operator anymore. Log out and
        deactivte the user, and emit 'observersChanged' signal.
        """
        self._signout()
        user = current_user
        name = self.display_name(user)
        self._drop_pending_handover(user.username)

        # If the session user logs out clear queue and sample list
        if user.has_role("user") and hasattr(HWR.beamline.session, "clear_session"):
            HWR.beamline.session.clear_session()

        if self.is_operator():
            self.db_set_in_control(current_user, False)

        self.app.server.user_datastore.delete_user(user)
        self.app.server.user_datastore.commit()
        flask_security.logout_user()

        self.app.server.emit("observersChanged", namespace="/hwr")
        self.notify("%s signed out" % name)

    def _drop_pending_handover(self, username: str) -> None:
        pending = self.pending_handover
        if pending and username in (pending["from"], pending["to"]):
            self.pending_handover = None

    def is_authenticated(self) -> bool:
        """Check if the current user is authenticated.

        Returns:
            ``True`` if the current user is authenticated.
        """
        return current_user.is_authenticated()

    def force_signout_user(self, username: str) -> None:
        """Disconnect ``username`` from the session (staff only).

        If the disconnected person was in control, control goes to the calling
        staff member.
        """
        user = self.get_user(username)
        if user is None or user.has_role("staff"):
            return

        was_in_control = user.in_control
        name = self.display_name(user)
        socketio_sid = user.socketio_session_id
        self._drop_pending_handover(username)
        self.app.server.user_datastore.delete_user(user)
        self.app.server.user_datastore.commit()
        self.app.server.emit("forceSignout", room=socketio_sid, namespace="/hwr")
        self.notify("%s was disconnected by %s" % (name, current_user.username))

        if was_in_control:
            self.transfer_control(current_user.username)
        else:
            self.app.server.emit("observersChanged", namespace="/hwr")

    def login_info(self) -> dict:
        """Get the login information to be displayed in the application.

        Login information to be displayed in the application such as:
        * synchrotron and beamline names
        * user infromation
        * proposals list
        * selected proposal
        * and so on

        Returns:
            Dictionary with login information.
        """
        # !!! replace hardcoded with value from config file
        login_type = "Proposal"
        if current_user.is_anonymous:
            self._signout()
            logging.getLogger("MX3.HWR").info("Logged out")
            return {
                "loggedIn": False,
                "useSSO": self.app.CONFIG.sso.USE_SSO,
                "loginType": login_type,
            }

        # Staff may be logged in before any user has opened a LIMS session
        session_manager = HWR.beamline.lims.session_manager
        active_session = session_manager.active_session if session_manager else None

        res = {
            "synchrotronName": HWR.beamline.session.synchrotron_name,
            "beamlineName": HWR.beamline.session.beamline_name,
            "loggedIn": True,
            "loginType": login_type,
            "limsName": HWR.beamline.lims.get_lims_name(),
            "proposalList": [active_session.__dict__] if active_session else [],
            "rootPath": HWR.beamline.session.get_base_image_directory(),
            "user": current_user.todict(),
            "useSSO": self.app.CONFIG.sso.USE_SSO,
        }

        res["selectedProposal"] = "%s%s" % (
            HWR.beamline.session.proposal_code,
            HWR.beamline.session.proposal_number,
        )
        res["selectedProposalID"] = HWR.beamline.session.proposal_id
        return res

    def update_user(self, user: User) -> None:
        """Update user information in datastore.

        Args:
            user: User model instance.
        """
        self.app.server.user_datastore.put(user)
        self.app.server.user_datastore.commit()

    def _get_configured_roles(self, user: str) -> list[str]:
        """Get the roles configured for the user.

        Inhouse user has always assigned staff role additionaly.

        Args:
            user: username.
        """
        roles = set()

        _ihs = ["%s%s" % prop for prop in HWR.beamline.session.in_house_users] 


        if self.config.inhouse_is_staff and user in _ihs:
            roles.add("staff")

        for _u in self.config.users:
            if _u.username == user:
                roles.add(_u.role)

                break

        return list(roles)

    def db_create_user(self, login_id: str, role: str, sso_data: dict) -> User:
        """Create the datastore user for a new login.

        Staff reuse their own entry. Users and guests may share a proposal
        login, so each of their logins gets its own entry (``login_id#n``).

        Args:
            login_id: The username or proposal used to log in.
            role: Session role (staff, user or guest).
            sso_data: dictionary containing information from the SSO service used.

        Returns:
            User model instance existing in or added to datastore.
        """
        sid = flask.session["sid"]
        user_datastore = self.app.server.user_datastore

        username = login_id
        _u = user_datastore.find_user(username=username)

        if _u and role != "staff":
            n = 2
            while user_datastore.find_user(username=f"{login_id}#{n}"):
                n += 1
            username, _u = f"{login_id}#{n}", None

        if not _u:
            _u = user_datastore.create_user(
                username=username,
                fullname=login_id if role == "staff" else f"mx{login_id}",
                password="",
                nickname=login_id,
                session_id=sid,
                selected_proposal=None if role == "staff" else login_id,
                refresh_token=sso_data.get("refresh_token", str(uuid.uuid4())),
                token=sso_data.get("token", str(uuid.uuid4())),
            )
        else:
            _u.refresh_token = sso_data.get("refresh_token", str(uuid.uuid4()))
            _u.token = sso_data.get("token", str(uuid.uuid4()))

        self.set_role(_u, role)

        return _u

    def db_set_in_control(self, user: User, control: bool) -> None:
        """Update users (their in_control field) in the datastore.

        If the passed user becomes an operator (``control=True``), the remaining users'
        in_control fields are set to ``False``. If passed user stops being an operator,
        only its in_control field is set to ``False``.

        Args:
            user: User model instance.
            control: the user becomes an operator (``True``) or not (``False``).
        """
        user_datastore = self.app.server.user_datastore
        if control:
            for _u in User.query.all():
                if _u.username == user.username:
                    _u.in_control = True
                else:
                    _u.in_control = False

                user_datastore.put(_u)
        else:
            _u = user_datastore.find_user(username=user.username)
            _u.in_control = control
            user_datastore.put(_u)

        self.app.server.user_datastore.commit()


class UserManager(BaseUserManager):
    """Class to provide specific implementations for user login and signout operations.

    It includes methods to handle login conditions such as checking if the user is
    active, anonymous, in-house, or accessing locally/remotely. The class also ensures
    that only one user can be logged in at a time and restricts in-house logins
    to local hosts. Additionally, it handles Single Sign-On (SSO) logout by making
    a request to the configured SSO logout URI.
    """

    def __init__(self, app, config):
        super().__init__(app, config)
     
    def _debug(self, msg: str):
        logging.getLogger("HWR").debug(msg)

    def _login(self, login_id: str, password: str, role: str = "user") -> str:
        """Authenticate ``login_id`` for ``role`` and return the effective role.

        Staff: LDAP account listed as staff in server.yaml, no PX1 project check.
        User and guest: PX1 project authorisation. A second "user" joins as guest;
        guests must log in with the proposal of the running session.
        """
        self._debug("_login. login_id=%s role=%s" % (login_id, role))
        session = HWR.beamline.session

        if role not in SESSION_ROLES:
            msg = "Unknown role %s" % role
            raise ValueError(msg)

        if role == "staff":
            if "staff" not in self._get_configured_roles(login_id):
                msg = "%s is not registered as beamline staff" % login_id
                raise PermissionError(msg)
            if not session.px1_authorisation(login_id, password, check_proposal=False)[1]:
                msg = "Bad Credentials"
                raise PermissionError(msg)
            return role

        proposal_enabled, ldap_access = session.px1_authorisation(login_id, password)
        if not ldap_access:
            msg = "Bad Credentials"
            raise PermissionError(msg)
        if not proposal_enabled:
            msg = "Unauthorised connection! Please contact your LC."
            raise PermissionError(msg)

        if role == "user" and self.get_session_user() is not None:
            role = "guest"

        if role == "guest":
            if self.get_session_user() is None:
                msg = "No user session is running, log in as user"
                raise PermissionError(msg)
            if login_id != session.get_projuser():
                msg = "Guests must log in with the proposal of the running session"
                raise PermissionError(msg)
            return role

        session.set_user_info(username=login_id, projuser=login_id)
        HWR.beamline.lims.login(login_id)
        return role

    def _signout(self, sso_data=None):
        sso_data = sso_data or {}

        if self.app.CONFIG.sso.LOGOUT_URI:
            if not current_user.is_anonymous:
                HWR.beamline.lims.remove_user(current_user.username)
                refresh_token = current_user.refresh_token
            else:
                refresh_token = sso_data.get("refresh_token", None)

            requests.post(
                self.app.CONFIG.sso.LOGOUT_URI,
                data={
                    "client_id": self.app.CONFIG.sso.CLIENT_ID,
                    "client_secret": self.app.CONFIG.sso.CLIENT_SECRET,
                    "refresh_token": refresh_token,
                },
            )


class SSOUserManager(BaseUserManager):
    def __init__(self, app, config):
        super().__init__(app, config)

    def _login(self, login_id: str, password: str, role: str = "user") -> str:
        return role

    def _signout(self):
        pass
