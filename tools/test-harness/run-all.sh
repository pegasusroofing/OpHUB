#!/bin/bash
# Runs every *-check.js against the dev server on :8081 and lists any that crash or report page errors.
# Checks that need a sample file (STMT, BOQ, SDS...) or EXTRA=1 are given EXTRA=1; ones needing files are noted.
cd "$(dirname "$0")"
for f in *-check.js; do
  S=shots/samples; out=$(EXTRA=1 BOQ=$S/boq.csv QUOTE=$S/quote.csv STMT=$S/stmt.csv SDS=$S/sds.pdf WO=$S/wo.pdf timeout 170 node "$f" 2>&1); code=$?
  err=$(echo "$out" | grep -E "^errors?:? " | grep -viE "errors?:? +none" | head -1)
  if [ $code -ne 0 ]; then echo "FAIL $f :: $(echo "$out" | grep -E "waiting for|Error" | head -1 | cut -c1-140)";
  elif [ -n "$err" ]; then echo "PAGEERR $f :: $(echo "$err" | cut -c1-140)";
  else echo "ok $f"; fi
done
