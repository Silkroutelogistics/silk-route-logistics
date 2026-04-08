#!/bin/bash
# MemPalace auto-save hook — fires every 15 messages or on Stop event
# Saves current session context to ChromaDB for cross-session recall
PALACE_PATH="$HOME/.mempalace/palace"
if command -v mempalace &> /dev/null && [ -d "$PALACE_PATH" ]; then
  mempalace mine "$(pwd)" --mode projects --quiet 2>/dev/null &
fi
