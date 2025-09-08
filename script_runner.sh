#! /bin/bash
# This script will call itself every minute

node box_api_index.js
sleep 60
./$0
