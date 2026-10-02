from .base import *  # noqa: F403

DEBUG = False
if SECRET_KEY == "unsafe-development-key-change-me":  # noqa: F405
    raise RuntimeError("Set SECRET_KEY in the environment before starting production.")
