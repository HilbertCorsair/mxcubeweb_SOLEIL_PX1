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
from mxcubecore.model.lims_session import LimsSessionManager
from mxcubeweb.core.components.component_base import ComponentBase
from mxcubeweb.core.models.usermodels import User
from mxcubeweb.core.util.networkutils import is_local_host


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
        
    def handle_sessions_changed(self, sessions):
        self.app.server.emit("sessionsChanged", namespace="/hwr")

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
        """
        try:
            # Calculate the cutoff time for inactive users
            cutoff_time = datetime.datetime.now() - flask.current_app.permanent_session_lifetime
            
            # Query only active users with last_request_timestamp older than the cutoff
            inactive_users = User.query.filter(
                User.active == True,
                User.last_request_timestamp.isnot(None),
                User.last_request_timestamp < cutoff_time
            ).all()
            
            # Process only the inactive users that need to be deactivated
            for _u in inactive_users:
                logging.getLogger("MX3.HWR").info(
                    "Logged out inactive user %s", _u.username
                )
                self.app.server.user_datastore.delete_user(_u)
                self.app.server.user_datastore.commit()

                self.app.server.emit(
                    "userChanged", room=_u.socketio_session_id, namespace="/hwr"
                )
                
            # Only emit observersChanged if we actually deactivated any users
            if inactive_users:
                self.app.server.emit("observersChanged", namespace="/hwr")
                
        except Exception as e:
            logging.getLogger("MX3.HWR").error(
                "Error updating active users: %s", str(e)
        )
            
    def update_operator(self, new_login: bool = False) -> None:
        if new_login:
            print("NEW LOGIN TRUE")
        """Sets the operator based on the logged in users.nnn

        If no user is currently in control, the first logged in user is set.
        Additionally, proposal is set based on the operator selected_proposal field.

        Args:
            new_login: True if method was invoked with new user login.
        """
        if current_user.is_anonymous:
            return
        
        try:
            # Find if any authenticated user is in control
            user_in_control = User.query.filter(
                User.is_authenticated == True,
                User.in_control == True
            ).first()
            print (f"C1 in control {user_in_control}")
            active_in_control = user_in_control is not None
            print("C2 -> ", active_in_control)

            # Reset control status for users not in control
            if active_in_control:
                # Only reset users that have in_control set to True
                users_to_reset = User.query.filter(
                    User.id != user_in_control.id,
                    User.in_control == True
                ).all()
                print('C3 users to reset', users_to_reset)
                
                for _u in users_to_reset:
                    self.db_set_in_control(_u, False)
            else:
                print ('C4 No users to reset')
            # If new login and new observer login, clear nickname
            if new_login:
                print("C5 - New login detected")
                current_user.nickname = ""

            print("C6 -- still in the try block")
            # If no user is currently in control, set this user to be in control
            if not active_in_control:
                print("C7 -- not active in control ")

                if not HWR.beamline.lims.is_user_login_type(): 
                    print("C8 bbis Avant get_full_uer name")
              
                    current_user.fullname =  HWR.beamline.lims.get_full_user_name()
                    current_user.nickname =  HWR.beamline.lims.get_user_name()
                    print("C8 -- is is_user_login_type ")
                    print(f"C8bis -{current_user}, contains : {dir(current_user)} ")
                else:
                    print("C9  -- else : not user logintype ")
                    current_user.nickname = current_user.username
                    
                    print(f"C9bis -{current_user}, contains : {dir(current_user)}")
                  
                self.db_set_in_control(current_user, True)
                user_in_control = current_user
            
            # Set active proposal to that of the active user
            for _u in User.query.all():
                if _u.is_authenticated and _u.in_control:
                    if not HWR.beamline.lims.is_user_login_type():
                        # In principle there is no need for doing so..
                        self.app.lims.select_session(
                           HWR.beamline.lims.session_manager.active_session.session_id
                        )  # The username is the proposal
                    elif _u.selected_proposal is not None:
                        self.app.lims.select_session(_u.selected_proposal)


            # Set active proposal based on the controlling user
            """if user_in_control:
                print("C10 user in control ")
                if not HWR.beamline.lims.is_user_login_type():
                    # Get the active session's proposal name

                    active_session = HWR.beamline.lims.session_manager.active_session
                    if active_session:
                   
                        self.app.lims.select_session(active_session.session_id)
                elif user_in_control.selected_proposal is not None:
                    self.app.lims.select_session(user_in_control.selected_proposal)"""
                    
        except Exception as e:
            logging.getLogger("MX3.HWR").error(
                "Error updating operator: %s", str(e)
            )


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
        print(f"--------------------------inhouse_user_id_list{self._inhouse_user_id_list}")
        return user_id in self._inhouse_user_id_list


    # Abstract method to be implemented by concrete implementation
    def _login(self, login_id: str, password: str) -> LimsSessionManager:
        pass

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

    def login(self, login_id: str, password: str, sso_data: dict = {}) -> None:

        """Login the user.

        Create new session for the user if it does not exist. Activate user in
        data store. If a sample is loaded in sample changer but not mounted,
        mount it and update the smaple list. Try update the operator.

        Args:
            login_id: The username.
            password: The password.
            sso_data: Dictionary containing information from the SSO service used.
        """
        auth = HWR.beamline.session.px1_authorisation(login_id, password)

        if not all(auth):
            return

        try:
            HWR.beamline.lims.init()
            HWR.beamline.lims.login(login_id)
            self._login(login_id, password)
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

            user = self.db_create_user(login_id, password, sso_data)
            self.app.server.user_datastore.activate_user(user)
            flask_security.login_user(user, remember=False)

            # Important to make flask_security user tracking work
            self.app.server.security.datastore.commit()
            """
            address = self.app.sample_changer.get_loaded_sample()

            # If A sample is mounted (and not already marked as such),
            # get sample changer contents and add mounted sample to the queue
            if not self.app.sample_changer.get_current_sample() and address:
                self.app.sample_changer.get_sample_list()
            """
            print("Updating operator with new_login = true")
            self.update_operator(new_login=True)
            print(f"OPERATOR UPDATE with new_login ")

            msg = "User %s signed in" % user.username
            logging.getLogger("MX3.HWR").info(msg)

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

        # If operator logs out clear queue and sample list
        if self.is_operator():
            if hasattr(HWR.beamline.session, "clear_session"):
                HWR.beamline.session.clear_session()

            self.db_set_in_control(current_user, False)

            msg = "User %s signed out" % user.username
            logging.getLogger("MX3.HWR").info(msg)

        self.app.server.user_datastore.delete_user(user)
        self.app.server.user_datastore.commit()
        flask_security.logout_user()

        self.app.server.emit("observersChanged", namespace="/hwr")

    def is_authenticated(self) -> bool:
        """Check if the current user is authenticated.

        Returns:
            ``True`` if the current user is authenticated.
        """
        return current_user.is_authenticated()

    def force_signout_user(self, username: str) -> None:
        """Force signout of the annonymous or non operating user.
        Args:
            username: username of the user to be signed out.
        """
        user = self.get_user(username)   
        if not user.in_control or current_user.is_anonymous:
            socketio_sid = user.socketio_session_id
            HWR.beamline.lims.remove_user(username)
            self.app.server.user_datastore.delete_user(user)
            self.app.server.user_datastore.commit()
            self.app.server.emit("forceSignout", room=socketio_sid, namespace="/hwr")

    def login_info(self) -> dict:
        print ("============================usermanager.py LOGIN_INFO ====================================================================================")

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
        # update_operator will update the login status of current_user, and make
        # sure that the is_anonymous has the correct value.
        # Update operator calls lims.select_session that raises an exception if
        # there are no valid LIMS sessions.


        if not HWR.beamline.lims.session_manager:
            print("NO LIMS Session MANAGER")
            res = {
            "synchrotronName":"",
            "beamlineName": "",
            "loggedIn": False,
            "loginType": "Proposal",
            "limsName": "ISPyB",
            "proposalList": [],
            "rootPath": "",
            "user": {},
            "useSSO": False,
        }
            return res
        else:
            print(f" _____ Found session manager {HWR.beamline.lims.session_manager}___________")


        with contextlib.suppress(Exception):
            
            #ssssssssself.update_operator()
            print("no calling OPERATOR UPDATE with new_login ")
        login_type = "Proposal"

        if current_user.is_anonymous:
            self._signout()
            logging.getLogger("MX3.HWR").info("Logged out")
            return {
                "loggedIn": False,
                "useSSO": self.app.CONFIG.sso.USE_SSO,
                "loginType": login_type,
            }

        # If no previous session selected and a single session available
        # then it selects automatically the session
        #if not HWR.beamline.lims.session_manager:


        print(f"Active session  IS {HWR.beamline.lims.session_manager.active_session}")


        res = {
            "synchrotronName": HWR.beamline.session.synchrotron_name,
            "beamlineName": HWR.beamline.session.beamline_name,
            "loggedIn": True,
            "loginType": login_type,
            "limsName": HWR.beamline.lims.get_lims_name(),
            "proposalList": [HWR.beamline.lims.session_manager.active_session.__dict__],
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

    def db_create_user(self, user: str, password: str, sso_data: dict) -> User:
        """Create or update user in datastore.
        If the user already exists, update the user information. If not create new one.
        Assign roles to the user, prevoiusly making sure the roles of 'staff' and
        'incontrol' existis in data store. If not create them also.
        Args:
            user: representation of username (eventually part of it).
                Also a nickname for new users.
            password: password (unused).
            sso_data: dictionary containing information from the SSO service used.
        Returns:
            User model instance existing in or added to datastore.
        """
        sid = flask.session["sid"]
        user_datastore = self.app.server.user_datastore
        sid = flask.session["sid"]
        user_datastore = self.app.server.user_datastore

        username = user
        HWR.beamline.lims.user_name = user
        fullname = f"mx{username}"#HWR.beamline.lims.get_full_user_name()
        

        # Make sure that the roles staff and incontrol always exists
        if not user_datastore.find_role("staff"):
            user_datastore.create_role(name="staff")
            user_datastore.create_role(name="incontrol")
            self.app.server.user_datastore.commit()
        
        try:

            _u = user_datastore.find_user(username=username)
        except:
            _u = None

        if not _u:
            if not HWR.beamline.lims.is_user_login_type():
                selected_proposal = user
            else:
                selected_proposal = None

            user_datastore.create_user(
                username=username,
                fullname=fullname,
                password="",
                nickname=user,
                session_id=sid,
                selected_proposal=selected_proposal,
                refresh_token=sso_data.get("refresh_token", str(uuid.uuid4())),
                token=sso_data.get("token", str(uuid.uuid4())),
                roles=self._get_configured_roles(user),
            )
        else:
            _u.refresh_token = sso_data.get("refresh_token", str(uuid.uuid4()))
            _u.token = sso_data.get("token", str(uuid.uuid4()))
            user_datastore.append_roles(_u, self._get_configured_roles(user))

        self.app.server.user_datastore.commit()


        return user_datastore.find_user(username=username)

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

    def _login(self, login_id: str, password: str) -> LimsSessionManager:
        """Check loging conditions such as: active, anonymous, inhouse, local/remote.

        Args:
            login_id: username
            password: password

        Returns:
            LimsSessionManager object with login information.
        """
        self._debug("_login. login_id=%s" % login_id)

        

        try:
            HWR.beamline.lims.login(login_id)

            print(f"test {HWR.beamline.lims == HWR.beamline.lims}")

        except Exception as e:
            logging.getLogger("MX3.HWR").error(e)
            raise e

            print("LOGIN SUCCESSFUL!: retunning session manager")
        """    
        if login_id in self.active_logged_in_users():
            if current_user.is_anonymous:
                self.force_signout_user(login_id)
            else:
                if current_user.username == login_id:
                    msg = "You are already logged in"
                    raise Exception(msg)
                msg = (
                    "Login rejected, you are already logged in"
                    " somewhere else\nand Another user is already"
                    " logged in"
                )
                raise Exception(msg)

        # Only allow in-house log-in from local host
        if self.is_inhouse_user(login_id) and not is_local_host():
            msg = "In-house only allowed from localhost"
            raise Exception(msg)
        # Only allow local login when remote is disabled
        if not self.app.ALLOW_REMOTE and not is_local_host():
            msg = "Remote access disabled"
            raise Exception(msg)
        """

        return HWR.beamline.lims.session_manager

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

    def _login(self, login_id: str, password: str, sso: bool):
        return {"status": {"code": "ok", "msg": ""}}

    def _signout(self):
        pass
