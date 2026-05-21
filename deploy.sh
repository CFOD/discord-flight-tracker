#!/bin/bash
set -e
cd /home/admin/programmes/flight-activity
npm run build
pm2 restart flight-tracker
echo "Deployed. Globe live at https://flightmap.cfod.co.uk"
