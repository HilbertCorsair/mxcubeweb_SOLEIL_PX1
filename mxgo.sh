#!/bin/bash 
export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubecore/:$PYTHONPATH
./mxcubeweb-server -r $(pwd)/test/HardwareObjectsMockup.xml/ --static-folder $(pwd)/ui/build/ -L debug

