from gevent import monkey

monkey.patch_all(thread=False)

# Disabling E402 (module level import not at top of file)
# for the lines below as we are monkey patching
import argparse  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402
import traceback  # noqa: E402
from pathlib import Path  # noqa: E402
from unittest import mock  # noqa: E402

from mxcubecore import HardwareRepository as HWR  # noqa: E402

from mxcubeweb.app import MXCUBEApplication as mxcube  # noqa: E402
from mxcubeweb.config import Config  # noqa: E402
from mxcubeweb.server import Server as server  # noqa: E402

sys.modules["Qub"] = mock.Mock()
sys.modules["Qub.CTools"] = mock.Mock()


def parse_args(argv):
    # by default load the 'demo' mocked beamline
    hwr_directory = str(Path(Path(__file__).parents[1], "demo"))

    opt_parser = argparse.ArgumentParser(
        description="mxcube-web Backend server command line utility."
    )

    opt_parser.add_argument(
        "-r",
        "--repository",
        dest="hwr_directory",
        help="Hardware Repository XML files path",
        default=hwr_directory,
    )

    opt_parser.add_argument(
        "-s",
        "--static-folder",
        dest="static_folder",
        help="Static folder",
        default=f"{os.getcwd()}ui/build",
    )

    opt_parser.add_argument(
        "-l",
        "--log-file",
        dest="log_file",
        help="Log file name",
        default="",
    )

    opt_parser.add_argument(
        "-L",
        "--log-level",
        dest="log_level",
        help="Log level for all loggers ",
        default="",
    )

    opt_parser.add_argument(
        "-el",
        "--enabled-loggers",
        dest="enabled_logger_list",
        help=(
            "Which loggers to use, default is to use all loggers"
            " ([exception_logger, hwr_logger, mx3_hwr_logger,"
            " user_logger, queue_logger])"
        ),
        default=[
            "exception_logger",
            "hwr_logger",
            "mx3_hwr_logger",
            "user_logger",
            "queue_logger",
            "mx3_ui_logger",
        ],
    )

    opt_parser.add_argument(
        "-w",
        "--ra",
        action="store_true",
        dest="allow_remote",
        help="Enable remote access",
        default=False,
    )

    opt_parser.add_argument(
        "-t",
        "--ra-timeout",
        action="store_true",
        dest="ra_timeout",
        help="Timeout gives control",
        default=False,
    )

    # If `argv` is `None`, then `argparse.ArgumentParser.parse_args`
    # will know to read from `sys.argv` instead.
    return opt_parser.parse_args(argv)


def build_server_and_config(test=False, argv=None):
    cmdline_options = parse_args(argv)

    try:
        # This refactoring (with other bits) allows you to pass a 'path1:path2' lookup path
        # as the hwr_directory. I need it for sensible managing of a multi-beamline test set-up
        # without continuously editing the main config files.
        # Note that the machinery was all there in the core already. rhfogh.
        HWR.init_hardware_repository(cmdline_options.hwr_directory)
        config_path = HWR.get_hardware_repository().find_in_repository("mxcube-web")

        cfg = Config(config_path)

        if test:
            cfg.flask.USER_DB_PATH = "/tmp/mxcube-test-user.db"

        server.init(cmdline_options, cfg)
        mxcube.init(
            server,
            cmdline_options.allow_remote,
            cmdline_options.ra_timeout,
            cmdline_options.log_file,
            cmdline_options.log_level,
            cmdline_options.enabled_logger_list,
            cfg,
        )

        server.register_routes(mxcube)
    except Exception:
        traceback.print_exc()
        raise

    return server, cfg


def code_origin(module):
    """Where a package is imported from, and at which git commit.

    An installed copy in site-packages silently wins over a git checkout
    whenever the checkout is not first on sys.path, so "the fix is in git"
    and "the fix is running" are two different claims. This says which.
    """
    import subprocess

    path = os.path.dirname(os.path.abspath(module.__file__))
    if "site-packages" in path or "dist-packages" in path:
        return "%s (NOT the git checkout: an installed copy)" % path
    # The proxima1 checkouts are owned by another user than the one running
    # MXCuBE, and git refuses to read them ("dubious ownership") unless told
    # they are safe. -c safe.directory is ignored by git 2.35.2-2.38, hence
    # also a throw-away global config, which every version honours.
    import tempfile

    git = ["git", "-c", "safe.directory=*", "-C", path]
    cfg = tempfile.NamedTemporaryFile("w", suffix=".gitconfig", delete=False)
    cfg.write("[safe]\n\tdirectory = *\n")
    cfg.close()
    env = {**os.environ, "GIT_CONFIG_GLOBAL": cfg.name, "GIT_OPTIONAL_LOCKS": "0"}
    try:
        sha = subprocess.run(
            [*git, "log", "-1", "--format=%h %cs %s"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
            env=env,
        ).stdout.strip()
        dirty = subprocess.run(
            [*git, "status", "--porcelain", "--untracked-files=no"],
            capture_output=True,
            text=True,
            timeout=5,
            env=env,
        ).stdout.strip()
        return "%s (git %s%s)" % (path, sha, ", uncommitted changes" if dirty else "")
    except Exception:
        return "%s (commit unknown)" % path
    finally:
        os.unlink(cfg.name)


def main():
    import logging

    import mxcubecore
    import mxcubeweb

    for module in (mxcubecore, mxcubeweb):
        msg = "%s imported from %s" % (module.__name__, code_origin(module))
        print(msg)
        logging.getLogger("HWR").info(msg)

    server, cfg = build_server_and_config()
    if server and cfg:
        server.run(cfg)
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
