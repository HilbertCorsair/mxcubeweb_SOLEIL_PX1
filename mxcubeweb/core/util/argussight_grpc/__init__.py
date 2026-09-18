"""Vendored argussight gRPC client stubs.

Camera discovery only needs these two generated modules, but installing the
argussight package into the mxcubeweb environment is impossible: it pins
pydantic ^2.13 (mxcubeweb pins <2.9), pillow ^12.2 and video-streamer.

``argus_service.proto`` is argussight 0.3.2's (``argussight/grpc/``, upstream
commit cb0d9e5, identical to the PyPI release). The two modules are NOT
argussight's own output: they were regenerated from that .proto with
**grpcio-tools 1.62.3** (protoc 25 / protobuf 4.25). argussight ships
grpcio-tools 1.70 output, which refuses any protobuf < 5.29 and grpcio < 1.70;
tensorflow 2.14 in the same environment pins protobuf < 5. The 1.62.3 output
has no version checks and loads on protobuf 3.20 up to at least 6.33, with any
grpcio. The wire format does not depend on the generator, so it talks to the
argussight server unchanged.

The only hand edit: in ``argus_service_pb2_grpc.py`` the ``argus_service_pb2``
import is relative. If argussight's .proto changes, copy it here and
regenerate with the same tools::

    pip install grpcio-tools==1.62.3
    python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. \\
        argus_service.proto

then redo the import edit. An installed argussight package takes precedence
when its own stubs load (see ``argussight_discovery``).
"""
