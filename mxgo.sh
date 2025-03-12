#!/bin/bash 
#export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PATH
export PATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubeweb:$PATH
#export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubeweb:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubeweb:$PYTHONPATH
#export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/mxcube_Dan/upgrade/mxcubecore/:$PYTHONPATH
export PYTHONPATH=/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/mxcubecore/:$PYTHONPATH
echo $PYTHONPATH
#./mxcubeweb-server -r ../config --static-folder $(pwd)/ui/build/ -L debug -l ./mxcubeweb.log

