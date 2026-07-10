import json
import time
from pathlib import Path
from typing import Optional

from filelock import FileLock

from config.plans import CREDITS_PER_GENERATION, DEFAULT_PLAN, PLANS

STORAGE_DIR = Path(__file__).parent / "storage"
USERS_FILE = STORAGE_DIR / "users.json"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

SECONDS_PER_MONTH = 30 * 24 * 60 * 60

# Single FileLock instance for the whole users.json file. Every function below
# acquires this for its *entire* read-modify-write cycle (not just the final
# save) -- that's what makes reserve_credit atomic across concurrent requests.
# filelock is both thread-safe (in-process) and process-safe (OS-level lock),
# which covers both "two browser tabs hitting the same uvicorn worker" and
# "a second backend process started by mistake".
_users_lock = FileLock(str(USERS_FILE) + ".lock", timeout=10)


def _load_users() -> list[dict]:
    if not USERS_FILE.exists():
        return []
    with USERS_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_users(users: list[dict]) -> None:
    tmp = USERS_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)
    tmp.replace(USERS_FILE)


def _find_user(users: list[dict], user_id: str) -> Optional[dict]:
    return next((u for u in users if u["user_id"] == user_id), None)


def _plan_for(user: dict) -> dict:
    return PLANS.get(user["plan"], PLANS[DEFAULT_PLAN])


def get_or_create_user(user_id: str, email: Optional[str]) -> dict:
    """Provision a new user record on first login, or apply the lazy monthly
    credit reset if credits_reset_at has passed. Called from auth.py on every
    request, under the same lock as reserve/release/consume so it can't race
    a reservation happening at the same moment."""
    now = time.time()
    with _users_lock:
        users = _load_users()
        user = _find_user(users, user_id)
        if user is None:
            user = {
                "user_id": user_id,
                "email": email,
                "plan": DEFAULT_PLAN,
                "credits_remaining": PLANS[DEFAULT_PLAN]["credits_per_month"],
                "credits_reserved": 0,
                "credits_reset_at": now + SECONDS_PER_MONTH,
                "created_at": now,
            }
            users.insert(0, user)
            _save_users(users)
            return dict(user)

        changed = False
        if email and user.get("email") != email:
            user["email"] = email
            changed = True
        if now >= user["credits_reset_at"]:
            plan = _plan_for(user)
            user["credits_remaining"] = plan["credits_per_month"]
            user["credits_reserved"] = 0
            user["credits_reset_at"] = now + SECONDS_PER_MONTH
            changed = True
        if changed:
            _save_users(users)
        return dict(user)


def get_user(user_id: str) -> Optional[dict]:
    with _users_lock:
        users = _load_users()
        user = _find_user(users, user_id)
        return dict(user) if user else None


def reserve_credit(user_id: str) -> bool:
    """Atomically checks and reserves 1 credit for user_id. The check
    (remaining - reserved > 0) and the write (increment credits_reserved)
    happen inside the same lock acquisition -- if this were read-check-then-
    write with the lock released in between, two concurrent requests with 1
    credit left could both pass the check and overcommit."""
    with _users_lock:
        users = _load_users()
        user = _find_user(users, user_id)
        if user is None:
            return False
        plan = _plan_for(user)
        if plan["unlimited"]:
            return True
        remaining = user["credits_remaining"] - user["credits_reserved"]
        if remaining < CREDITS_PER_GENERATION:
            return False
        user["credits_reserved"] += CREDITS_PER_GENERATION
        _save_users(users)
        return True


def release_reservation(user_id: str) -> None:
    """Job failed or was canceled -- undo the reservation, no credit spent."""
    with _users_lock:
        users = _load_users()
        user = _find_user(users, user_id)
        if user is None:
            return
        if _plan_for(user)["unlimited"]:
            return
        user["credits_reserved"] = max(0, user["credits_reserved"] - CREDITS_PER_GENERATION)
        _save_users(users)


def consume_reservation(user_id: str) -> None:
    """Job succeeded -- the reservation is spent: drop it from both
    credits_reserved and credits_remaining."""
    with _users_lock:
        users = _load_users()
        user = _find_user(users, user_id)
        if user is None:
            return
        if _plan_for(user)["unlimited"]:
            return
        user["credits_reserved"] = max(0, user["credits_reserved"] - CREDITS_PER_GENERATION)
        user["credits_remaining"] = max(0, user["credits_remaining"] - CREDITS_PER_GENERATION)
        _save_users(users)
