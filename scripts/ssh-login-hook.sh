#!/bin/sh
# Installed by `latch hook install` into /etc/profile.d/.
# Reprints the current pairing link on every interactive SSH login.
if [ -n "$SSH_CONNECTION" ]; then
  latch pair 2>/dev/null
fi
