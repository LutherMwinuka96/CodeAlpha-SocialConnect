import re

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from apps.core.utils import notify
from apps.notifications.models import Notification
from apps.social.models import Comment
from .models import Hashtag, Post, PostHashtag

User = get_user_model()
HASHTAG_RE = re.compile(r"(?<!\w)#([\w]{1,80})", re.UNICODE)
MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z0-9_.]{1,150})")


class PostAuthorSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()
    bio = serializers.CharField(source="profile.bio", read_only=True)
    is_following = serializers.SerializerMethodField()
    follows_you = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "full_name", "avatar", "bio", "is_following", "follows_you")

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_avatar(self, obj):
        if not hasattr(obj, "profile") or not obj.profile.avatar:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.profile.avatar.url) if request else obj.profile.avatar.url

    def get_is_following(self, obj):
        post = self.context.get("post")
        return bool(post and getattr(post, "viewer_follows_author", False))

    @extend_schema_field(serializers.BooleanField())
    def get_follows_you(self, obj):
        post = self.context.get("post")
        return bool(post and getattr(post, "author_follows_viewer", False))


class PostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    hashtags = serializers.SerializerMethodField()
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    liked_by_me = serializers.SerializerMethodField()
    bookmarked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ("id", "author", "text", "image", "edited", "hashtags", "likes_count", "comments_count", "liked_by_me", "bookmarked_by_me", "created_at", "updated_at")
        read_only_fields = ("id", "author", "edited", "created_at", "updated_at")

    @extend_schema_field(PostAuthorSerializer)
    def get_author(self, obj):
        return PostAuthorSerializer(obj.author, context={**self.context, "post": obj}).data

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_hashtags(self, obj):
        return [tag.name for tag in obj.hashtags.all()]

    @extend_schema_field(serializers.BooleanField())
    def get_liked_by_me(self, obj):
        return bool(getattr(obj, "viewer_liked", False))

    @extend_schema_field(serializers.BooleanField())
    def get_bookmarked_by_me(self, obj):
        return bool(getattr(obj, "viewer_bookmarked", False))

    @transaction.atomic
    def create(self, validated_data):
        post = Post.objects.create(author=self.context["request"].user, **validated_data)
        self._sync_hashtags(post)
        for username in set(MENTION_RE.findall(post.text)):
            mentioned = User.objects.filter(username__iexact=username).first()
            if mentioned:
                notify(mentioned, post.author, Notification.MENTION, post=post)
        return post

    @transaction.atomic
    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.edited = True
        instance.save()
        self._sync_hashtags(instance)
        return instance

    def _sync_hashtags(self, post):
        tags = {tag.casefold() for tag in HASHTAG_RE.findall(post.text)}
        post.post_hashtags.all().delete()
        for name in tags:
            hashtag, _ = Hashtag.objects.get_or_create(name=name)
            PostHashtag.objects.get_or_create(post=post, hashtag=hashtag)
        if hasattr(post, "_prefetched_objects_cache"):
            post._prefetched_objects_cache.pop("hashtags", None)


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    likes_count = serializers.IntegerField(read_only=True)
    liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ("id", "post", "author", "text", "edited", "likes_count", "liked_by_me", "created_at", "updated_at")
        read_only_fields = ("id", "post", "author", "edited", "created_at", "updated_at")

    def get_author(self, obj):
        return PostAuthorSerializer(obj.author, context=self.context).data

    def get_liked_by_me(self, obj):
        return bool(getattr(obj, "viewer_liked", False))
