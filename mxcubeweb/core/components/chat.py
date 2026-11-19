import datetime
import os
import uuid

from flask_login import current_user
from werkzeug.utils import secure_filename

from mxcubeweb.core.components.component_base import ComponentBase


class Chat(ComponentBase):
    def __init__(self, app, config):
        super().__init__(app, config)

    def db_add_message(self, message, from_username, from_nickname, from_host):
        _m = self.app.server.user_datastore.create_message(
            message=message,
            from_username=from_username,
            from_nickname=from_nickname,
            from_host=from_host,
        )

        for _user in self.app.usermanager.get_members():
            self.app.server.user_datastore.add_message_to_user(_user, _m)

    def append_message(self, message, user=None, action=None):
        """Store and broadcast a chat message.

        Without ``user`` the message is a system notice. ``action`` describes a
        pending control handover the recipient can accept or decline.
        """
        if user is None:
            username, nickname, host, role = "system", "MXCuBE", "", "system"
        else:
            username, nickname = user.username, user.nickname or user.username
            host, role = user.current_login_ip, user.role

        data = {
            "message": message,
            "username": username,
            "nickname": nickname,
            "host": host,
            "role": role,
            "action": action,
            "date": datetime.datetime.now().strftime("%H:%M"),
        }

        self.db_add_message(message, username, nickname, host)
        self.app.server.emit("ra_chat_message", data, namespace="/hwr")

    def upload_dir(self):
        """Folder of the files shared in the chat (created on first use)."""
        cfg = self.app.CONFIG.flask
        path = cfg.CHAT_UPLOAD_DIR or os.path.join(
            os.path.dirname(os.path.abspath(cfg.USER_DB_PATH)), "chat_files"
        )
        os.makedirs(path, exist_ok=True)
        return path

    def save_file(self, upload):
        """Store an uploaded file under a unique name and return that name.

        The name keeps the sanitised original after a random prefix, so two
        files with the same name never overwrite each other.
        """
        name = f"{uuid.uuid4().hex}_{secure_filename(upload.filename) or 'file'}"
        upload.save(os.path.join(self.upload_dir(), name))
        return name

    def get_all_messages(self):
        message_list = []

        for _m in current_user.messages:
            message_list.append(
                {
                    "message": _m.message,
                    "username": _m.from_username,
                    "nickname": _m.from_nickname,
                    "host": _m.from_host,
                    "role": self._sender_role(_m.from_username),
                    "date": _m.at.strftime("%H:%M"),
                    "read": _m.read,
                }
            )

        return message_list[-100:]

    def _sender_role(self, username):
        """Role shown next to a stored message's sender, like live ones."""
        if username == "system":
            return "system"
        user = self.app.server.user_datastore.find_user(username=username)
        return user.role if user else None

    def set_all_messages_read(self):
        for _m in current_user.messages:
            _m.read = True

        self.app.server.user_datastore.commit()
