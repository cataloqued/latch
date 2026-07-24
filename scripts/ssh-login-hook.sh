
# Installed by `latch hook install` into /etc/profile.d/
# Reprints the pairing link on every SSH login
if [ -n "$SSH_CONNECTION" ]; then
  latch pair 2>/dev/null
fi
