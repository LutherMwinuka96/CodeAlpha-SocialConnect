from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Count, Exists, OuterRef, Q
from django.middleware.csrf import get_token
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import OpenApiTypes, extend_schema

from apps.core.authentication import clear_auth_cookies, set_auth_cookies
from apps.core.pagination import StandardPagination
from apps.core.permissions import IsOwnerOrReadOnly
from apps.core.utils import api_error
from apps.social.models import Follow
from .models import User
from .serializers import MeSerializer, PasswordChangeSerializer, RegistrationSerializer, UserSerializer


def visible_users(viewer):
    return User.objects.select_related("profile").annotate(
        followers_count=Count("follower_links", distinct=True),
        following_count=Count("following_links", distinct=True),
        posts_count=Count("posts", distinct=True),
        viewer_follows=Exists(Follow.objects.filter(follower=viewer, following_id=OuterRef("pk"))),
        viewer_follows_you=Exists(Follow.objects.filter(follower_id=OuterRef("pk"), following=viewer)),
    )


class RegisterThrottle(AnonRateThrottle):
    scope = "register"


class LoginThrottle(AnonRateThrottle):
    scope = "login"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response({"csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegisterThrottle]

    @extend_schema(request=RegistrationSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user, context={"request": request}).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=UserSerializer)
    def post(self, request):
        identifier = str(request.data.get("username", "")).strip()
        password = request.data.get("password", "")
        if not identifier or not password:
            return api_error("Username/email and password are required.", details={"username": ["This field is required."]})
        if "@" in identifier:
            matched = User.objects.filter(email__iexact=identifier).only("username").first()
            identifier = matched.username if matched else identifier
        user = authenticate(request, username=identifier, password=password)
        if not user or not user.is_active:
            return api_error("Invalid username/email or password.", status.HTTP_401_UNAUTHORIZED, code="authentication_failed")
        refresh = RefreshToken.for_user(user)
        response = Response(UserSerializer(user, context={"request": request}).data)
        set_auth_cookies(response, refresh.access_token, refresh)
        return response


@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        refresh_token = request.COOKIES.get("refresh_token") or request.data.get("refresh")
        if not refresh_token:
            return api_error("Refresh token is required.", status.HTTP_401_UNAUTHORIZED, code="authentication_failed")
        serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
        serializer.is_valid(raise_exception=True)
        tokens = serializer.validated_data
        response = Response({"refreshed": True})
        set_auth_cookies(response, tokens["access"], tokens.get("refresh"))
        return response


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.OBJECT, responses={204: None})
    def post(self, request):
        token = request.COOKIES.get("refresh_token") or request.data.get("refresh")
        if token:
            try:
                RefreshToken(token).blacklist()
            except Exception:  # Expired, already blacklisted, or malformed tokens are already logged out.
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_auth_cookies(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(MeSerializer(request.user, context={"request": request}).data)

    @extend_schema(request=MeSerializer, responses=MeSerializer)
    def patch(self, request):
        serializer = MeSerializer(request.user, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(request=OpenApiTypes.OBJECT, responses={204: None})
    def delete(self, request):
        if not request.user.check_password(request.data.get("current_password", "")):
            return api_error("Enter your password to confirm account deletion.", details={"current_password": ["Password is required or incorrect."]})
        request.user.delete()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_auth_cookies(response)
        return response


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=("password",))
        return Response({"detail": "Password updated. Please sign in again."})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        email = str(request.data.get("email", "")).strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/password-reset/?uid={uid}&token={token}"
            send_mail("Reset your CodeAlpha Connect password", f"Use this link to choose a new password:\n\n{reset_url}\n\nIf you did not request this change, you can ignore this email.", None, [user.email])
        return Response({"detail": "If the account exists, reset instructions have been sent."})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        try:
            uid = force_str(urlsafe_base64_decode(request.data.get("uid", "")))
            user = User.objects.get(pk=uid, is_active=True)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist):
            return api_error("Reset link is invalid or expired.")
        if not default_token_generator.check_token(user, request.data.get("token", "")):
            return api_error("Reset link is invalid or expired.")
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        password = request.data.get("password", "")
        try:
            validate_password(password, user)
        except ValidationError as exc:
            return api_error("Password does not meet the security requirements.", details={"password": exc.messages})
        user.set_password(password)
        user.save(update_fields=("password",))
        return Response({"detail": "Password reset successfully."})


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "username"
    pagination_class = StandardPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return User.objects.none()
        queryset = visible_users(self.request.user).order_by("username")
        query = self.request.query_params.get("search", "").strip()
        if query:
            queryset = queryset.filter(Q(username__icontains=query) | Q(full_name__icontains=query))
        return queryset

    @action(detail=True, methods=["get"])
    def followers(self, request, username=None):
        user = self.get_object()
        queryset = visible_users(request.user).filter(following_links__following=user).order_by("username")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=True, methods=["get"])
    def following(self, request, username=None):
        user = self.get_object()
        queryset = visible_users(request.user).filter(follower_links__follower=user).order_by("username")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=True, methods=["get"])
    def posts(self, request, username=None):
        from apps.posts.serializers import PostSerializer
        from apps.posts.views import post_queryset
        user = self.get_object()
        queryset = post_queryset(request.user).filter(author=user)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(PostSerializer(page, many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def media(self, request, username=None):
        from apps.posts.serializers import PostSerializer
        from apps.posts.views import post_queryset
        user = self.get_object()
        queryset = post_queryset(request.user).filter(author=user).exclude(image="")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(PostSerializer(page, many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def likes(self, request, username=None):
        from apps.posts.serializers import PostSerializer
        from apps.posts.views import post_queryset
        user = self.get_object()
        queryset = post_queryset(request.user).filter(likes__user=user).distinct()
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(PostSerializer(page, many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def replies(self, request, username=None):
        from apps.posts.serializers import CommentSerializer
        from apps.social.models import Comment
        user = self.get_object()
        queryset = Comment.objects.filter(author=user).select_related("author", "author__profile", "post", "post__author").annotate(likes_count=Count("likes", distinct=True)).order_by("-created_at")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(CommentSerializer(page, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"])
    def suggestions(self, request):
        followed = Follow.objects.filter(follower=request.user).values("following_id")
        queryset = self.get_queryset().exclude(Q(pk=request.user.pk) | Q(pk__in=followed)).annotate(mutuals=Count("follower_links__follower__following_links", filter=Q(follower_links__follower__following_links__following=request.user), distinct=True)).order_by("-mutuals", "-followers_count", "username")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=True, methods=["post", "delete"])
    def follow(self, request, username=None):
        target = self.get_object()
        if target == request.user:
            return api_error("You cannot follow yourself.")
        if request.method == "POST":
            _, created = Follow.objects.get_or_create(follower=request.user, following=target)
            if created:
                from apps.core.utils import notify
                from apps.notifications.models import Notification
                notify(target, request.user, Notification.FOLLOW)
            return Response(status=status.HTTP_204_NO_CONTENT)
        Follow.objects.filter(follower=request.user, following=target).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
