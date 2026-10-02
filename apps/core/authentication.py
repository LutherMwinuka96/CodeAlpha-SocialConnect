from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class CookieJWTAuthentication(JWTAuthentication):
    """Accept the access JWT in an httpOnly cookie and enforce CSRF on writes."""

    def authenticate(self, request):
        raw_token = request.COOKIES.get("access_token")
        if not raw_token:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
        except InvalidToken:
            # An expired or malformed browser cookie is equivalent to no session.
            # This lets visitors sign in again and receive fresh cookies.
            return None
        user = self.get_user(validated_token)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            SessionAuthentication().enforce_csrf(request)
        return user, validated_token


def set_auth_cookies(response, access, refresh=None):
    from django.conf import settings

    secure = settings.SIMPLE_JWT.get("AUTH_COOKIE_SECURE", not settings.DEBUG)
    response.set_cookie("access_token", str(access), httponly=True, secure=secure, samesite="Lax", path="/")
    if refresh:
        response.set_cookie("refresh_token", str(refresh), httponly=True, secure=secure, samesite="Lax", path="/api/v1/auth/")


def clear_auth_cookies(response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/v1/auth/")
