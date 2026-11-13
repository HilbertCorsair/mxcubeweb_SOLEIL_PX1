from flask import (
    Blueprint,
    Response,
    jsonify,
    make_response,
    request,
)
from flask_login import current_user

DISCONNECT_HANDLED = True


# Disabling C901 function is too complex (19)
def init_route(app, server, url_prefix):  # noqa: C901
    bp = Blueprint("remote_access", __name__, url_prefix=url_prefix)

    um = app.usermanager

    def require_staff():
        if not current_user.has_role("staff"):
            return make_response("Reserved to beamline staff", 403)
        return None

    def open_handover(kind, to_user):
        """Register a pending handover and ask ``to_user`` in the chat."""
        if um.pending_handover:
            return make_response("Another control request is pending", 409)

        um.pending_handover = {
            "kind": kind,
            "from": current_user.username,
            "to": to_user.username,
        }
        verb = "offers control to" if kind == "offer" else "asks for control to"
        um.notify(
            "%s %s %s"
            % (um.display_name(current_user), verb, um.display_name(to_user)),
            action=um.pending_handover,
        )
        server.emit("observersChanged", namespace="/hwr")
        return make_response("", 200)

    @bp.route("/request_control", methods=["POST"])
    @server.restrict
    def request_control():
        """A guest asks the session user for control."""
        session_user = um.get_session_user()
        if not current_user.has_role("guest") or session_user is None:
            return make_response("Only guests can request control", 403)
        if not session_user.in_control:
            return make_response("Staff are in charge of the session", 409)
        return open_handover("request", session_user)

    @bp.route("/offer_control", methods=["POST"])
    @server.restrict
    def offer_control():
        """The session user in control offers it to another member."""
        target = um.get_user(request.get_json().get("username"))
        if not (current_user.has_role("user") and current_user.in_control):
            return make_response("Only the user in control can offer it", 403)
        if target is None or target.username == current_user.username:
            return make_response("Unknown user", 404)
        return open_handover("offer", target)

    @bp.route("/cancel_request", methods=["POST"])
    @server.restrict
    def cancel_request():
        """Cancel the pending handover opened by the current user."""
        pending = um.pending_handover
        if pending and pending["from"] == current_user.username:
            um.pending_handover = None
            um.notify("%s cancelled the request" % um.display_name(current_user))
            server.emit("observersChanged", namespace="/hwr")
        return make_response("", 200)

    @bp.route("/handover_response", methods=["POST"])
    @server.restrict
    def handover_response():
        """Accept or decline the pending handover addressed to the current user."""
        pending = um.pending_handover
        if not pending or pending["to"] != current_user.username:
            return make_response("No request addressed to you", 409)

        if not request.get_json().get("accept"):
            um.pending_handover = None
            um.notify("%s declined the request" % um.display_name(current_user))
            server.emit("observersChanged", namespace="/hwr")
            return make_response("", 200)

        # Control passes from the user in control to the requester or offer target
        giver, new_op = (
            (pending["to"], pending["from"])
            if pending["kind"] == "request"
            else (pending["from"], pending["to"])
        )
        operator = um.get_operator()
        if operator is None or operator.username != giver:
            um.pending_handover = None
            server.emit("observersChanged", namespace="/hwr")
            return make_response("Control changed hands meanwhile", 409)

        um.transfer_control(
            new_op, swap_roles=not um.get_user(new_op).has_role("staff")
        )
        return make_response("", 200)

    @bp.route("/take_control", methods=["POST"])
    @server.restrict
    def take_control():
        """Staff take charge of the session."""
        denied = require_staff()
        if denied:
            return denied
        if not um.is_operator():
            um.transfer_control(current_user.username)
        return make_response("", 200)

    @bp.route("/release_control", methods=["POST"])
    @server.restrict
    def release_control():
        """Staff hand control back to the session user."""
        denied = require_staff()
        if denied:
            return denied
        if um.is_operator():
            session_user = um.get_session_user()
            um.transfer_control(session_user.username if session_user else None)
        return make_response("", 200)

    @bp.route("/update_user_nickname", methods=["POST"])
    @server.restrict
    def update_user_nickname():
        """ """
        name = request.get_json().get("name")
        current_user.nickname = name
        um.update_user(current_user)

        server.emit(
            "userChanged", room=current_user.socketio_session_id, namespace="/hwr"
        )
        server.emit("observersChanged", namespace="/hwr")

        return make_response("", 200)

    @bp.route("/logout_user", methods=["POST"])
    @server.restrict
    def logout_user():
        """Staff disconnect a member from the session."""
        denied = require_staff()
        if denied:
            return denied
        um.force_signout_user(request.get_json().get("username"))
        return make_response("", 200)

    @bp.route("/mute", methods=["POST"])
    @server.restrict
    def mute():
        """Staff silence or unsilence a member in the chat."""
        denied = require_staff()
        if denied:
            return denied
        data = request.get_json()
        user = um.get_user(data.get("username"))
        if user is None:
            return make_response("Unknown user", 404)

        muted = bool(data.get("muted"))
        um.set_muted(user, muted)
        server.emit("userChanged", room=user.socketio_session_id, namespace="/hwr")
        server.emit("observersChanged", namespace="/hwr")
        um.notify(
            "%s was %s by %s"
            % (
                um.display_name(user),
                "muted" if muted else "unmuted",
                current_user.username,
            )
        )
        return make_response("", 200)

    @bp.route("/", methods=["GET"])
    @server.restrict
    def rasettings():
        """ """
        data = {
            "members": [_u.todict() for _u in um.get_members()],
            "observers": [_u.todict() for _u in um.get_observers()],
            "pending": um.pending_handover,
            "allowRemote": app.ALLOW_REMOTE,
        }

        return jsonify(data=data)

    @bp.route("/allow_remote", methods=["POST"])
    @server.restrict
    def allow_remote():
        """ """
        allow = request.get_json().get("allow")

        if app.ALLOW_REMOTE and not allow:
            server.emit("forceSignoutObservers", {}, namespace="/hwr")

        app.ALLOW_REMOTE = allow

        return Response(status=200)

    @bp.route("/chat", methods=["POST"])
    @server.restrict
    def append_message():
        if current_user.has_role("muted"):
            return make_response("You have been muted", 403)

        message = request.get_json().get("message", "")
        if message:
            app.chat.append_message(message, current_user)

        return Response(status=200)

    @bp.route("/chat", methods=["GET"])
    @server.restrict
    def get_all_mesages():
        return jsonify({"messages": app.chat.get_all_messages()})

    @bp.route("/chat/set_all_read", methods=["POST"])
    @server.restrict
    def set_all_messages_read():
        app.chat.set_all_messages_read()
        return Response(status=200)

    @server.flask_socketio.on("connect", namespace="/hwr")
    @server.ws_restrict
    def connect():
        current_user.socketio_session_id = request.sid
        app.usermanager.update_user(current_user)

    @server.flask_socketio.on("disconnect", namespace="/hwr")
    def disconnect():
        if current_user.is_anonymous:
            return

        current_user.socketio_session_id = None
        current_user.socketio_session_id = request.sid

    return bp
