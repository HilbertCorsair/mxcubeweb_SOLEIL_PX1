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
./mxcubeweb-server -r ../config --static-folder $(pwd)/ui/build/ -L debug -l $HOME/MXCuBElogs/mxcube.log

