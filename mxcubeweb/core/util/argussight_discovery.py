"""Discover beamline camera streams exposed by argussight.

Argussight (https://github.com/mxcube/argussight) aggregates several camera
streams and exposes them uniformly as MPEG1 WebSocket streams behind a proxy at
``ws://<host>:<proxy_port>/ws/<name>``. The list of available stream names is
obtained via the ``GetProcesses`` gRPC call.

This module turns that gRPC response into a list of camera components that the
web UI's "Beamline Cameras" switcher understands
(:class:`mxcubeweb.core.models.configmodels._UICameraConfigModel`).

Everything here is best-effort and fully guarded: if the argussight Python/gRPC
stubs are not installed, or the server is unreachable (e.g. off the beamline
network), :func:`discover_streams` logs a warning and returns an empty list so
callers can fall back to the static ``camera_setup`` configuration.
"""

import logging

logger = logging.getLogger("MX3.HWR")

# Time (s) we are willing to wait for the gRPC call before giving up. Kept short
# so a missing/hung argussight never blocks the ui-properties request.
_GRPC_TIMEOUT = 2.0


def discover_streams(host, port, proxy_url, cameras_meta=None):
    """Return the argussight camera streams as UI camera components.

    Args:
        host: argussight gRPC server host.
        port: argussight gRPC server port.
        proxy_url: base WebSocket URL of the argussight stream proxy, e.g.
            ``ws://<host>:7000/ws`` (no trailing slash required).
        cameras_meta: optional ``{name: {label, width, height, format}}`` map
            providing display metadata. When non-empty, only the streams listed
            here are returned, in the given order.

    Returns:
        list[dict]: one dict per stream with ``name``, ``label``, ``url``,
        ``format``, ``width``, ``height`` and ``oav`` keys. Empty on any error or
        when no stream is available.
    """
    cameras_meta = cameras_meta or {}

    try:
        import grpc

        import argussight.grpc.argus_service_pb2 as pb2
        import argussight.grpc.argus_service_pb2_grpc as pb2_grpc
    except ImportError:
        logger.warning(
            "Argussight gRPC stubs not importable; skipping camera discovery. "
            "Install argussight in the mxcubeweb environment to enable it."
        )
        return []

    try:
        with grpc.insecure_channel(f"{host}:{port}") as channel:
            stub = pb2_grpc.SpawnerServiceStub(channel)
            response = stub.GetProcesses(
                pb2.GetProcessesRequest(), timeout=_GRPC_TIMEOUT
            )
    except Exception as ex:  # grpc.RpcError and anything else
        logger.warning("Argussight discovery failed (%s:%s): %s", host, port, ex)
        return []

    if getattr(response, "status", "") != "success":
        logger.warning(
            "Argussight GetProcesses returned status=%r", getattr(response, "status", "")
        )
        return []

    available = list(response.streams)

    # Decide which streams to expose and in what order: the configured metadata
    # list wins (order + restriction); otherwise every discovered stream.
    if cameras_meta:
        names = [name for name in cameras_meta if name in available]
    else:
        names = available

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

    logger.info("Argussight discovery: %d stream(s) found", len(components))
    return components
