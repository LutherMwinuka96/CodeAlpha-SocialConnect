import re

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from apps.posts.models import Post
from apps.social.models import Follow
from .models import Profile, User


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name", "password", "password_confirm")
        read_only_fields = ("id",)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        candidate = User(username=attrs.get("username", ""), email=attrs.get("email", ""), full_name=attrs.get("full_name", ""))
        try:
            password_validation.validate_password(attrs["password"], candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data.pop("password_confirm", None)
        return User.objects.create_user(password=password, **validated_data)


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ("avatar", "cover", "bio", "location", "website", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    bio = serializers.CharField(source="profile.bio", read_only=True)
    location = serializers.CharField(source="profile.location", read_only=True)
    website = serializers.CharField(source="profile.website", read_only=True)
    followers_count = serializers.IntegerField(read_only=True)
    following_count = serializers.IntegerField(read_only=True)
    posts_count = serializers.IntegerField(read_only=True)
    follows_you = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "full_name", "avatar", "cover", "bio", "location", "website", "followers_count", "following_count", "posts_count", "follows_you", "is_following")

    def get_avatar(self, obj):
        if not hasattr(obj, "profile") or not obj.profile.avatar:
            return None
        request = self.context.get("request")
        url = obj.profile.avatar.url
        return request.build_absolute_uri(url) if request else url

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_cover(self, obj):
        if not hasattr(obj, "profile") or not obj.profile.cover:
            return None
        request = self.context.get("request")
        url = obj.profile.cover.url
        return request.build_absolute_uri(url) if request else url

    @extend_schema_field(serializers.BooleanField())
    def get_is_following(self, obj):
        if hasattr(obj, "viewer_follows"):
            return obj.viewer_follows
        user = self.context.get("request").user if self.context.get("request") else None
        return bool(user and user.is_authenticated and Follow.objects.filter(follower=user, following=obj).exists())

    @extend_schema_field(serializers.BooleanField())
    def get_follows_you(self, obj):
        if hasattr(obj, "viewer_follows_you"):
            return obj.viewer_follows_you
        user = self.context.get("request").user if self.context.get("request") else None
        return bool(user and user.is_authenticated and Follow.objects.filter(follower=obj, following=user).exists())


class MeSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(required=False)

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name", "theme", "profile", "date_joined")
        read_only_fields = ("id", "username", "email", "date_joined")

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", {})
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        profile = instance.profile
        for field, value in profile_data.items():
            setattr(profile, field, value)
        if profile_data:
            profile.save()
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=10)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Passwords do not match."})
        try:
            password_validation.validate_password(attrs["new_password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})
        return attrs
