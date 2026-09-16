#!/bin/bash 
#export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PATH

export MURKO_PATH=/nfs/ruche/share-dev/px1dev/Arthur/murko-develop
export MURKO_SIZEX=1360
export MURKO_SIZEY=1024
export MURKO_HOST=localhost
export MURKO_PORT=89011
export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubeweb:$PATH
#export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubeweb:$PYTHONPATH
#export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubecore/:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubecore/:$PYTHONPATH

# --- Argussight camera stack -------------------------------------------------
# The sample view's camera switcher needs argussight (gRPC :50051, proxy :7000)
# plus its video-streamers. If they are not already up, start the whole stack
# (start_argus_px1.sh) in its own conda env, detached so it outlives MXCuBE
# restarts. If the operator presses Cancel on the camera prompt, MXCuBE is not
# started; any other failure only warns (MXCuBE runs without the switcher).
# Set ARGUS_AUTOSTART=0 to skip all of this.
ARGUS_AUTOSTART=${ARGUS_AUTOSTART-1}
ARGUS_START=${ARGUS_START-/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubecore/scripts/argussight/start_argus_px1.sh}
ARGUS_CONDA_ENV=${ARGUS_CONDA_ENV-argussight}
ARGUS_LOG=${ARGUS_LOG-$HOME/MXCuBElogs/argussight.log}
ARGUS_WAIT=${ARGUS_WAIT-120}   # seconds; leaves time to answer the camera prompt

# The gRPC server binds [::]:50051, so try IPv6 loopback too.
port_open() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null || (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null
}

if [ "$ARGUS_AUTOSTART" = "1" ]; then
    if port_open 50051 && port_open 7000; then
        echo "argussight already running"
    elif port_open 50051 || port_open 7000; then
        echo "WARNING: argussight is half up (only one of :50051/:7000 open); not starting it." >&2
        echo "         Stop it with: kill \$(cat /tmp/argus.pids)" >&2
    elif [ ! -x "$ARGUS_START" ]; then
        echo "WARNING: $ARGUS_START not found or not executable; starting MXCuBE without argussight." >&2
    else
        # Activate conda from the same install that is running this script.
        if [ -n "$CONDA_EXE" ]; then
            export CONDA_ACTIVATE="$(dirname "$CONDA_EXE")/activate"
        fi
        mkdir -p "$(dirname "$ARGUS_LOG")"
        echo "=== $(date) mxgo.sh starting argussight ===" >> "$ARGUS_LOG"
        echo "starting argussight in conda env '$ARGUS_CONDA_ENV' (log: $ARGUS_LOG) ..."
        # setsid: own session, so Ctrl-C of the server does not reach the stack.
        # PYTHONPATH above points at mxcubeweb/mxcubecore; keep it out of that env.
        env -u PYTHONPATH CONDA_ENV="$ARGUS_CONDA_ENV" MXCUBE_ENV="$ARGUS_CONDA_ENV" \
            setsid -w "$ARGUS_START" >> "$ARGUS_LOG" 2>&1 < /dev/null &
        argus_pid=$!

        waited=0
        while :; do
            if port_open 50051 && port_open 7000; then
                echo "argussight up (pids in /tmp/argus.pids)"
                break
            fi
            if ! kill -0 "$argus_pid" 2>/dev/null; then
                wait "$argus_pid"
                rc=$?
                if [ "$rc" -eq 2 ]; then
                    echo "Camera check cancelled by the operator; not starting MXCuBE." >&2
                    exit 2
                fi
                echo "WARNING: argussight exited with code $rc; starting MXCuBE without it." >&2
                tail -n 20 "$ARGUS_LOG" >&2
                break
            fi
            if [ "$waited" -ge "$ARGUS_WAIT" ]; then
                echo "WARNING: argussight not up after ${ARGUS_WAIT}s (still starting?); continuing." >&2
                echo "         Reload the page once it is up. Log: $ARGUS_LOG" >&2
                break
            fi
            sleep 1
            waited=$((waited + 1))
        done
    fi
fi

./mxcubeweb-server -r ../config --static-folder $(pwd)/ui/build/ -L debug -l $HOME/MXCuBElogs/mxcube.log

