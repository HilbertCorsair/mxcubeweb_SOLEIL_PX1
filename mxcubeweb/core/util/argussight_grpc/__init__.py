"""Vendored argussight gRPC client stubs.

Camera discovery only needs these two generated modules, but installing the
argussight package into the mxcubeweb environment is impossible: it pins
pydantic ^2.13 (mxcubeweb pins <2.9), pillow ^12.2 and video-streamer. With this
copy the mxcubeweb environment only needs ``grpcio>=1.70.0`` and
``protobuf>=5.29,<6``.

Copied verbatim from argussight 0.3.2 (``argussight/grpc/``, upstream commit
cb0d9e5, identical to the PyPI release). The only edit: in
``argus_service_pb2_grpc.py`` the absolute ``argussight.grpc`` import is now
relative. ``argus_service.proto`` is kept alongside for reference. If
argussight's .proto changes, regenerate with the grpcio-tools version it pins::

    python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. \\
        argus_service.proto

and redo the import edit. An installed argussight package always takes
precedence (see ``argussight_discovery``).
"""
