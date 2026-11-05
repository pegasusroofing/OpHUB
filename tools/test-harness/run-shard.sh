#!/bin/bash
# Like run-all.sh, but runs only every Nth check (shard K of N), so several can run side by side:
#   bash run-shard.sh 0 3 & bash run-shard.sh 1 3 & bash run-shard.sh 2 3
cd "$(dirname "$0")"
K=$1; N=$2; i=0
for f in *-check.js; do
  if [ $((i % N)) -eq "$K" ]; then
    S=shots/samples; out=$(EXTRA=1 BOQ=$S/boq.csv QUOTE=$S/quote.csv STMT=$S/stmt.csv SDS=$S/sds.pdf WO=$S/wo.pdf timeout 170 node "$f" 2>&1); code=$?
    err=$(echo "$out" | grep -E "^errors?:? " | grep -viE "errors?:? +none" | head -1)
    fails=$(echo "$out" | grep -E "^FAIL " | head -2 | tr '\n' ' ')
    if [ $code -ne 0 ]; then echo "FAIL $f :: $(echo "$out" | grep -E "waiting for|Error|FAIL" | head -1 | cut -c1-160)";
    elif [ -n "$err" ]; then echo "PAGEERR $f :: $(echo "$err" | cut -c1-160)";
    elif [ -n "$fails" ]; then echo "CHECKFAIL $f :: $(echo "$fails" | cut -c1-160)";
    else echo "ok $f"; fi
  fi
  i=$((i + 1))
done
