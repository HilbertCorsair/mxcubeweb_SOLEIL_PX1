"""Discover beamline camera streams exposed by argussight.

Argussight (https://github.com/mxcube/argussight) aggregates several camera
streams and exposes them uniformly as MPEG1 WebSocket streams behind a proxy at
``ws://<host>:<proxy_port>/ws/<name>``. The list of available stream names is
obtained via the ``GetProcesses`` gRPC call.

This module turns that gRPC response into a list of camera components that the
web UI's "Beamline Cameras" switcher understands
(:class:`mxcubeweb.core.models.configmodels._UICameraConfigModel`).

The proxy URL is passed through untouched, so ``ARGUSSIGHT_PROXY_URL`` may be
either an absolute ``wss://host[:port]/argus`` or a root-relative ``/argus``.
The relative form is preferred: the page resolves it against its own origin
(see ``initJSMpeg`` in ``SampleImage.jsx``), so the stream cannot end up on a
different port from the one the page was served on -- which is exactly what
happens when nginx publishes something other than :443 and the absolute URL
still names the old port.

The gRPC stubs come from an installed argussight package if there is one, else
from the copy vendored in :mod:`mxcubeweb.core.util.argussight_grpc`, so the
mxcubeweb environment only needs ``grpcio`` and ``protobuf``.

Everything here is best-effort and fully guarded: if grpcio/protobuf are
missing or the wrong version, or the server is unreachable, :func:`discover_streams`
logs a warning and returns the configured cameras unchecked. The proxy URL is
known without gRPC, and with argussight enabled the direct video-streamer is not
running, so a guessed stream URL is the only one that can still work.
"""

import logging

logger = logging.getLogger("MX3.HWR")

# Time (s) we are willing to wait for the gRPC call before giving up. Kept short
# so a missing/hung argussight never blocks the ui-properties request.
_GRPC_TIMEOUT = 2.0

# What the mxcubeweb environment needs for discovery. NOT the argussight
# package itself: its pydantic/pillow pins clash with mxcubeweb's. Any grpcio
# and protobuf >= 3.20.3 work with the vendored stubs, so whatever tensorflow
# (protobuf < 5) already installed is fine; do not upgrade protobuf for this.
_GRPC_REQUIREMENT = '"grpcio<2" "protobuf>=3.20.3"'


def _import_stubs():
    """Return ``(grpc, pb2, pb2_grpc)``, or None (logged) if unavailable.

    An installed argussight package wins when its stubs load; they need
    protobuf >= 5.29 and grpcio >= 1.70, so on older versions (e.g. the
    protobuf 4 tensorflow requires) the copy vendored in ``argussight_grpc``
    is used instead.
    """
    try:
        import grpc

        try:
            import argussight.grpc.argus_service_pb2 as pb2
            import argussight.grpc.argus_service_pb2_grpc as pb2_grpc
        except Exception:  # not installed, or its stubs reject these versions
            from mxcubeweb.core.util.argussight_grpc import argus_service_pb2 as pb2
            from mxcubeweb.core.util.argussight_grpc import (
                argus_service_pb2_grpc as pb2_grpc,
            )
    except ImportError as ex:
        logger.warning(
            "Argussight camera discovery disabled: %s. Install into the "
            "mxcubeweb environment: pip install %s",
            ex,
            _GRPC_REQUIREMENT,
        )
        return None
    except Exception as ex:  # e.g. a protobuf too old for the vendored stubs
        logger.warning(
            "Argussight camera discovery disabled, gRPC stubs failed to load: %s."
            " Needs: pip install %s",
            ex,
            _GRPC_REQUIREMENT,
        )
        return None
    return grpc, pb2, pb2_grpc


def discover_streams(host, port, proxy_url, cameras_meta=None):
    """Return the argussight camera streams as UI camera components.

    Args:
        host: argussight gRPC server host.
        port: argussight gRPC server port.
        proxy_url: base URL of the argussight stream proxy as the browser
            should open it, e.g. ``wss://<public host>:<port>/argus`` or the
            root-relative ``/argus`` (no trailing slash required).
        cameras_meta: optional ``{name: {label, width, height, format}}`` map
            providing display metadata. When non-empty, only the streams listed
            here are returned, in the given order.

    Returns:
        list[dict]: one dict per stream with ``name``, ``label``, ``url``,
        ``format``, ``width``, ``height`` and ``oav`` keys. When gRPC fails, the
        streams listed in ``cameras_meta``, unchecked (empty if none are).
        Empty when argussight answers but none of those streams exist.
    """
    cameras_meta = cameras_meta or {}

    stubs = _import_stubs()
    if stubs is None:
        return _unchecked(proxy_url, cameras_meta)
    grpc, pb2, pb2_grpc = stubs

    try:
        # grpc honours http(s)_proxy; on the beamline that is the SOLEIL site
        # proxy, which cannot reach argussight on this host. Never use it.
        with grpc.insecure_channel(
            f"{host}:{port}", options=[("grpc.enable_http_proxy", 0)]
        ) as channel:
            stub = pb2_grpc.SpawnerServiceStub(channel)
            response = stub.GetProcesses(
                pb2.GetProcessesRequest(), timeout=_GRPC_TIMEOUT
            )
    except Exception as ex:  # grpc.RpcError and anything else
        logger.warning("Argussight discovery failed (%s:%s): %s", host, port, ex)
        return _unchecked(proxy_url, cameras_meta)

    if getattr(response, "status", "") != "success":
        logger.warning(
            "Argussight GetProcesses returned status=%r",
            getattr(response, "status", ""),
        )
        return _unchecked(proxy_url, cameras_meta)

    available = list(response.streams)

    # Decide which streams to expose and in what order: the configured metadata
    # list wins (order + restriction); otherwise every discovered stream.
    if cameras_meta:
        names = [name for name in cameras_meta if name in available]
        if not names:
            logger.warning(
                "Argussight discovery: none of the ARGUSSIGHT_CAMERAS %s is "
                "among the registered streams %s; check the names in server.yaml",
                list(cameras_meta),
                available,
            )
    else:
        names = available

    components = _components(proxy_url, names, cameras_meta)
    logger.info("Argussight discovery: %d stream(s) found", len(components))
    return components


def _unchecked(proxy_url, cameras_meta):
    """The configured streams, for when argussight cannot be asked."""
    if cameras_meta:
        logger.warning(
            "Argussight discovery: using the configured cameras %s unchecked",
            list(cameras_meta),
        )
    return _components(proxy_url, list(cameras_meta), cameras_meta)


def _components(proxy_url, names, cameras_meta):
    """One UI camera component per stream name, addressed through the proxy."""
    base = proxy_url.rstrip("/")
    components = []
    for name in names:
        meta = cameras_meta.get(name, {})
        components.append(
            {
                "name": name,
                "label": meta.get("label") or name,
                "url": f"{base}/{name}",
                "format": meta.get("format") or "MPEG1",
                "width": meta.get("width"),
                "height": meta.get("height"),
                "oav": bool(meta.get("oav")),
            }
        )
    return components
