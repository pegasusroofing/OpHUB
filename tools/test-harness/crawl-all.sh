#!/bin/bash
# Presses every button as each role in turn. Results in shots/crawl/. Read them with: node crawl-report.js
cd "$(dirname "$0")"
for r in ${ROLES:-admin pm site_manager operative driver client}; do
  for s in 0 1 2 3 4 5; do MAX=30 ROUTE_MS=300000 node crawl.js "$r" "$s" 6 > /dev/null 2>&1 & done
  wait
  echo "$r finished $(date +%H:%M)"
done
