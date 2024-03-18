#!/bin/bash 

mxcubeweb-server -r $(pwd)/test/HardwareObjectsMockup.xml/ --static-folder $(pwd)/ui/build/ -L debug

