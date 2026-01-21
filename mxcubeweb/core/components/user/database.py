import datetime

from flask_security import SQLAlchemySessionUserDatastore
from sqlalchemy import create_engine
from sqlalchemy.orm import (
    declarative_base,
    scoped_session,
    sessionmaker,
)

Base = declarative_base()


def init_db(path):

# Configure connection pool to handle concurrent requests 
# pool_size: number of connections to maintain persistently 
# max_overflow: additional connections that can be created on demand 
# pool_timeout: seconds to wait before giving up on getting a connection 
# pool_pre_ping: verify connections before using them 
# connect_args: SQLite-specific settings for better concurrency 
    engine = create_engine( 
        f"sqlite:///{path}", pool_size=20, # Increased from default 5
        max_overflow=30, # Increased from default 10 
        pool_timeout=60, # Increased from default 30 
        pool_pre_ping=True, # Verify connections before using 
        connect_args={ 
            "check_same_thread": False, # Allow multi-threaded access
            "timeout": 20, # SQLite connection timeout in seconds
            }, echo=False, # Set to True for SQL query logging (debug only)
            )

    db_session = scoped_session(
        sessionmaker(autocommit=False, autoflush=False, bind=engine)
    )
    Base.query = db_session.query_property()
    Base.metadata.create_all(bind=engine)

    return db_session


class UserDatastore(SQLAlchemySessionUserDatastore):
    """A UserDatastore implementation that assumes the
    use of
    `Flask-SQLAlchemy <https://pypi.python.org/pypi/flask-sqlalchemy/>`_
    for datastore transactions.
    :param db:
    :param user_model: See :ref:`Models <models_topic>`.
    :param role_model: See :ref:`Models <models_topic>`.
    """

    # pyflakes are a bit picky with F821 (Undefined name),
    # not even sure "Message" should ba considered as an undefined name
    def __init__(
        self,
        *args,
        message_model=type["Message"],  # noqa: F821
        **kwargs,
    ):
        SQLAlchemySessionUserDatastore.__init__(self, *args, **kwargs)
        self._message_model = message_model
        self._messages_users_model = type["MessagesUsers"]  # noqa: F821

    def create_message(self, message, from_username, from_nickname, from_host):
        return self.put(
            self._message_model(
                message=message,
                at=datetime.datetime.now(),
                from_username=from_username,
                from_nickname=from_nickname,
                from_host=from_host,
            )
        )

    def add_message_to_user(self, user, message):
        user.messages.append(message)
        self.put(user)
        self.commit()

    def get_all_messages(self):
        return self._message_model.query.all()

    def append_roles(self, user, roles):
        for role in roles:
            if not user.has_role(role):
                if not self.find_role(role):
                    _r = self.create_role(name=role)
                    user.roles.append(_r)
                else:
                    user.roles.append(self.find_role(role))

        self.commit()
