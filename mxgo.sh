#!/bin/bash 
#export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PATH
export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubeweb:$PATH
#export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubeweb:$PYTHONPATH
#export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubecore/:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubecore/:$PYTHONPATH
./mxcubeweb-server -r $(pwd)/test/HardwareObjectsMockup.xml/ --static-folder $(pwd)/ui/build/ -L debug -l ./mxcubeweb.log

