#!/bin/bash
# Clear all captured flows from the sandbox

cd "$(dirname "$0")/.."

read -p "Clear all sandbox captured flows? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f sandbox/data/backchannel_flows.jsonl
    echo "Sandbox flows cleared."
else
    echo "Cancelled."
fi
