#!/bin/bash
# MemPalace pre-compact hook — fires before context window fills up
# Saves critical decisions before they're compressed away
PALACE_PATH="$HOME/.mempalace/palace"
if command -v mempalace &> /dev/null && [ -d "$PALACE_PATH" ]; then
  mempalace mine "$(pwd)" --mode projects --quiet 2>/dev/null &
fi
