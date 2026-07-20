import time

import credits

# No external auth service -- every request is treated as the same local
# user. Kept as a FastAPI dependency (rather than inlining a constant) so
# every route's `Depends(get_current_user)` and the credits/plans system
# keep working unchanged.
LOCAL_USER_ID = "local-user"
LOCAL_USER_EMAIL = "admin@localhost"

# Timestamp of the last request, used by main.py's idle auto-stop task to
# decide when the RunPod pod has gone unused.
_last_activity_at = time.time()


def get_last_activity() -> float:
    return _last_activity_at


def get_current_user() -> str:
    """FastAPI dependency: no real authentication -- provisions/refreshes the
    single local user's users.json record and returns its id."""
    global _last_activity_at
    _last_activity_at = time.time()
    credits.get_or_create_user(LOCAL_USER_ID, LOCAL_USER_EMAIL)
    return LOCAL_USER_ID
