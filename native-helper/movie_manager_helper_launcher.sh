#!/bin/sh
echo "launcher: started $(date)" >> /tmp/movie_manager_helper.log
exec "/opt/homebrew/Cellar/python@3.14/3.14.3_1/Frameworks/Python.framework/Versions/3.14/bin/python3.14" "/Users/xugu/Documents/projects/movie_manager/native-helper/movie_manager_helper.py" 2>> /tmp/movie_manager_helper.log
